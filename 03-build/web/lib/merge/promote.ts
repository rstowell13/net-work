/**
 * Enrich existing contacts and promote email correspondents to contacts.
 *
 * Runs after dedupe/merge. For each gmail-derived raw_contact that is still
 * unlinked (contact_id IS NULL) and has a real display name (captured from the
 * email header in lib/sync/gmail.ts):
 *
 *  - If its address is already on an existing contact → skip (relink already
 *    covers it via that contact's email).
 *  - Else if its name matches exactly one existing contact → ATTACH the raw to
 *    that contact (enriches phone-only contacts with their email address).
 *  - Else if it qualifies (real name AND two-way correspondence) → CREATE a new
 *    contact for it.
 *  - Else leave it orphaned.
 *
 * Affected contacts are relinked so their email correspondence appears in the
 * diary and their primary email is filled.
 *
 * Refs: plan Phase 1, Step 3.
 */
import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { normalizeName } from "./normalize";
import { qualifiesForPromotion } from "./promote-criteria";
import { getSelfEmails, relinkContact } from "@/lib/relink";

export { qualifiesForPromotion };

export interface PromoteStats {
  considered: number;
  attachedToExisting: number;
  created: number;
  skipped: number;
}

export async function enrichAndPromote(userId: string): Promise<PromoteStats> {
  const stats: PromoteStats = {
    considered: 0,
    attachedToExisting: 0,
    created: 0,
    skipped: 0,
  };
  const selfEmails = await getSelfEmails(userId);

  // 1. Index existing contacts by their (non-self) emails and normalized name.
  const existingRaws = await db
    .select({
      contactId: schema.rawContacts.contactId,
      emails: schema.rawContacts.emails,
    })
    .from(schema.rawContacts)
    .innerJoin(
      schema.contacts,
      eq(schema.contacts.id, schema.rawContacts.contactId),
    )
    .where(eq(schema.contacts.userId, userId));
  const emailToContact = new Map<string, string>();
  for (const r of existingRaws) {
    if (!r.contactId) continue;
    for (const e of r.emails ?? []) {
      const lo = e?.toLowerCase();
      if (lo && !selfEmails.has(lo) && !emailToContact.has(lo)) {
        emailToContact.set(lo, r.contactId);
      }
    }
  }

  const existingContacts = await db
    .select({ id: schema.contacts.id, displayName: schema.contacts.displayName })
    .from(schema.contacts)
    .where(
      and(eq(schema.contacts.userId, userId), isNull(schema.contacts.deletedAt)),
    );
  const nameToContacts = new Map<string, string[]>();
  for (const c of existingContacts) {
    const n = normalizeName(c.displayName);
    if (!n) continue;
    const arr = nameToContacts.get(n) ?? [];
    arr.push(c.id);
    nameToContacts.set(n, arr);
  }

  // 2. Candidate raws: unlinked, gmail-derived, with a real name + an address.
  const candidates = await db
    .select({
      id: schema.rawContacts.id,
      name: schema.rawContacts.name,
      emails: schema.rawContacts.emails,
    })
    .from(schema.rawContacts)
    .innerJoin(
      schema.sources,
      eq(schema.sources.id, schema.rawContacts.sourceId),
    )
    .where(
      and(
        eq(schema.sources.userId, userId),
        eq(schema.sources.kind, "gmail"),
        isNull(schema.rawContacts.contactId),
      ),
    );

  const affected = new Set<string>();
  const createNew: { rawId: string; name: string; email: string }[] = [];

  for (const r of candidates) {
    const email = r.emails?.[0]?.toLowerCase() ?? null;
    if (!email || selfEmails.has(email)) {
      stats.skipped++;
      continue;
    }
    stats.considered++;

    if (emailToContact.has(email)) {
      // Address already on a contact — relink covers the correspondence.
      stats.skipped++;
      continue;
    }

    const normName = normalizeName(r.name);
    const matches = normName ? (nameToContacts.get(normName) ?? []) : [];
    if (matches.length === 1) {
      // Attach this address to the single same-named existing contact.
      await db
        .update(schema.rawContacts)
        .set({ contactId: matches[0], updatedAt: new Date() })
        .where(eq(schema.rawContacts.id, r.id));
      affected.add(matches[0]);
      emailToContact.set(email, matches[0]);
      stats.attachedToExisting++;
      continue;
    }

    // No address/name match — candidate for a brand-new contact, pending a
    // two-way-interaction check (computed in batch below).
    if (normName && r.name) {
      createNew.push({ rawId: r.id, name: r.name, email });
    } else {
      stats.skipped++;
    }
  }

  // 3. Two-way interaction counts for the create-new candidates.
  if (createNew.length > 0) {
    const addrs = [...new Set(createNew.map((c) => c.email))];
    const inbound = new Map<string, number>();
    const outbound = new Map<string, number>();
    const CHUNK = 500;
    for (let i = 0; i < addrs.length; i += CHUNK) {
      const slice = addrs.slice(i, i + CHUNK);
      const inRows = await db
        .select({
          addr: sql<string>`lower(${schema.emails.fromEmail})`,
          n: sql<number>`count(*)::int`,
        })
        .from(schema.emails)
        .where(
          and(
            eq(schema.emails.direction, "inbound"),
            inArray(sql`lower(${schema.emails.fromEmail})`, slice),
          ),
        )
        .groupBy(sql`lower(${schema.emails.fromEmail})`);
      for (const row of inRows) inbound.set(row.addr, row.n);

      const outRows = await db
        .select({
          addr: sql<string>`lower(t.addr)`,
          n: sql<number>`count(*)::int`,
        })
        .from(
          sql`${schema.emails}, unnest(${schema.emails.toEmails}) as t(addr)`,
        )
        .where(
          and(
            eq(schema.emails.direction, "outbound"),
            inArray(sql`lower(t.addr)`, slice),
          ),
        )
        .groupBy(sql`lower(t.addr)`);
      for (const row of outRows) outbound.set(row.addr, row.n);
    }

    // Within this run, a person can own several addresses (all same name).
    // The first qualifying address creates the contact; later same-name
    // addresses attach to it instead of creating duplicates.
    const createdByName = new Map<string, string>();
    for (const c of createNew) {
      const normName = normalizeName(c.name);
      const already = normName ? createdByName.get(normName) : undefined;
      if (already) {
        await db
          .update(schema.rawContacts)
          .set({ contactId: already, updatedAt: new Date() })
          .where(eq(schema.rawContacts.id, c.rawId));
        affected.add(already);
        stats.attachedToExisting++;
        continue;
      }
      const ok = qualifiesForPromotion({
        name: c.name,
        inbound: inbound.get(c.email) ?? 0,
        outbound: outbound.get(c.email) ?? 0,
      });
      if (!ok) {
        stats.skipped++;
        continue;
      }
      const contactId = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(schema.contacts)
          .values({
            userId,
            displayName: c.name,
            primaryEmail: c.email,
          })
          .returning({ id: schema.contacts.id });
        await tx
          .update(schema.rawContacts)
          .set({ contactId: created.id, updatedAt: new Date() })
          .where(eq(schema.rawContacts.id, c.rawId));
        return created.id;
      });
      if (normName) createdByName.set(normName, contactId);
      affected.add(contactId);
      stats.created++;
    }
  }

  // 4. Relink every affected contact so correspondence + primaries populate.
  for (const cid of affected) {
    await relinkContact(cid).catch((err) => {
      console.error(`enrichAndPromote relink failed for ${cid}:`, err);
    });
  }

  return stats;
}
