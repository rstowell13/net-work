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
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { normalizeName } from "./normalize";
import { qualifiesForPromotion } from "./promote-criteria";
import { isRoleAddress } from "@/lib/contacts/role-address";
import { isBusinessName } from "@/lib/contacts/business-name";
import { getSelfEmails, relinkContact } from "@/lib/relink";

export { qualifiesForPromotion };

export interface PromoteStats {
  considered: number;
  attachedToExisting: number;
  created: number;
  skipped: number;
}

export async function enrichAndPromote(
  userId: string,
  opts: { relink?: boolean } = {},
): Promise<PromoteStats> {
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
    if (!email || selfEmails.has(email) || isRoleAddress(email)) {
      // Role / automated addresses (info@, support@, noreply@, …) never become
      // contacts — see lib/contacts/role-address.ts.
      stats.skipped++;
      continue;
    }
    if (r.name && isBusinessName(r.name)) {
      // Business / department names (Collections Department, Accounts Payable,
      // …) never become contacts — see lib/contacts/business-name.ts.
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

  // 3. Two-way interaction counts for the create-new candidates. Fetch the
  // email directions/addresses ONCE and count in memory — the previous
  // per-chunk `unnest(to_emails)` aggregation seq-scanned the whole emails
  // table several times and stalled on a large mailbox.
  if (createNew.length > 0) {
    const wanted = new Set(createNew.map((c) => c.email));
    const inbound = new Map<string, number>();
    const outbound = new Map<string, number>();
    const allEmails = await db
      .select({
        direction: schema.emails.direction,
        fromEmail: schema.emails.fromEmail,
        toEmails: schema.emails.toEmails,
      })
      .from(schema.emails);
    for (const e of allEmails) {
      if (e.direction === "inbound") {
        const f = e.fromEmail?.toLowerCase();
        if (f && wanted.has(f)) inbound.set(f, (inbound.get(f) ?? 0) + 1);
      } else {
        for (const t of e.toEmails ?? []) {
          const lo = t.toLowerCase();
          if (wanted.has(lo)) outbound.set(lo, (outbound.get(lo) ?? 0) + 1);
        }
      }
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
  // Skippable (opts.relink === false) when the caller runs a single global
  // relinkAfterMerge afterward — per-contact relink over a large dangling
  // backlog is too slow.
  if (opts.relink !== false) {
    for (const cid of affected) {
      await relinkContact(cid).catch((err) => {
        console.error(`enrichAndPromote relink failed for ${cid}:`, err);
      });
    }
  }

  return stats;
}
