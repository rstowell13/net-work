/**
 * One-off cleanup: soft-delete existing contacts whose emails are ALL role /
 * automated addresses (info@, noreply@, support@, …) and dismiss the pending
 * merge candidates that are made up entirely of such addresses.
 *
 * Operational, not part of the app bundle. Dry-run by default — pass --apply to
 * make changes. Reversible: undo with
 *   UPDATE contacts SET deleted_at = NULL WHERE …
 * Nothing is hard-deleted; raw_contacts and email history are untouched.
 *
 * Run with:
 *   node --env-file=.env.local --conditions=react-server --import tsx scripts/remove-role-contacts.ts            # dry run
 *   node --env-file=.env.local --conditions=react-server --import tsx scripts/remove-role-contacts.ts --apply     # apply
 *
 * Definition of "removable" matches lib/contacts/role-address.ts and the
 * prevention filters in lib/merge/promote.ts + lib/merge/dedupe.ts: a contact is
 * removed only when it has ≥1 email and EVERY email is a role address. A contact
 * with any real personal email is kept.
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { isRoleAddress } from "@/lib/contacts/role-address";

function log(...a: unknown[]) {
  console.log(new Date().toISOString(), ...a);
}

async function getOwner() {
  const email = process.env.APP_OWNER_EMAIL;
  if (!email) throw new Error("APP_OWNER_EMAIL not set");
  const [u] = await db
    .select({ id: schema.users.id, email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  if (!u) throw new Error(`owner ${email} not found`);
  return u;
}

/** All emails are role addresses (and there's at least one). */
function isRoleOnly(emails: Set<string>): boolean {
  if (emails.size === 0) return false;
  for (const e of emails) if (!isRoleAddress(e)) return false;
  return true;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const u = await getOwner();
  log("owner", u.email, u.id, apply ? "(APPLY)" : "(dry run)");

  // 1. Non-deleted contacts + the union of every email across their raws.
  const contacts = await db
    .select({
      id: schema.contacts.id,
      displayName: schema.contacts.displayName,
      primaryEmail: schema.contacts.primaryEmail,
    })
    .from(schema.contacts)
    .where(
      and(eq(schema.contacts.userId, u.id), isNull(schema.contacts.deletedAt)),
    );

  const emailsByContact = new Map<string, Set<string>>();
  for (const c of contacts) {
    const set = new Set<string>();
    if (c.primaryEmail) set.add(c.primaryEmail.toLowerCase());
    emailsByContact.set(c.id, set);
  }

  const rawRows = await db
    .select({
      contactId: schema.rawContacts.contactId,
      emails: schema.rawContacts.emails,
    })
    .from(schema.rawContacts)
    .innerJoin(
      schema.contacts,
      eq(schema.contacts.id, schema.rawContacts.contactId),
    )
    .where(
      and(eq(schema.contacts.userId, u.id), isNull(schema.contacts.deletedAt)),
    );
  for (const r of rawRows) {
    if (!r.contactId) continue;
    const set = emailsByContact.get(r.contactId);
    if (!set) continue;
    for (const e of r.emails ?? []) if (e) set.add(e.toLowerCase());
  }

  const removable = contacts.filter((c) =>
    isRoleOnly(emailsByContact.get(c.id) ?? new Set()),
  );

  log(`contacts: ${contacts.length} total, ${removable.length} removable`);
  for (const c of removable) {
    const emails = [...(emailsByContact.get(c.id) ?? [])].join(", ");
    log(`  REMOVE  ${c.displayName}  [${emails}]`);
  }

  // 2. Pending merge candidates made up entirely of role-only raws.
  const pending = await db
    .select({
      id: schema.mergeCandidates.id,
      rawContactIds: schema.mergeCandidates.rawContactIds,
    })
    .from(schema.mergeCandidates)
    .where(
      and(
        eq(schema.mergeCandidates.userId, u.id),
        eq(schema.mergeCandidates.status, "pending"),
      ),
    );

  const allRawIds = [...new Set(pending.flatMap((p) => p.rawContactIds))];
  const rawEmailById = new Map<string, Set<string>>();
  if (allRawIds.length > 0) {
    const raws = await db
      .select({ id: schema.rawContacts.id, emails: schema.rawContacts.emails })
      .from(schema.rawContacts)
      .where(inArray(schema.rawContacts.id, allRawIds));
    for (const r of raws) {
      rawEmailById.set(
        r.id,
        new Set((r.emails ?? []).filter(Boolean).map((e) => e!.toLowerCase())),
      );
    }
  }
  const junkCandidates = pending.filter((p) =>
    p.rawContactIds.every((rid) => isRoleOnly(rawEmailById.get(rid) ?? new Set())),
  );
  log(
    `pending merge candidates: ${pending.length} total, ${junkCandidates.length} role-only (to dismiss)`,
  );

  if (!apply) {
    log("dry run — no changes made. Re-run with --apply to remove these.");
    process.exit(0);
  }

  // 3. Apply: soft-delete removable contacts + dismiss junk candidates.
  const now = new Date();
  if (removable.length > 0) {
    await db
      .update(schema.contacts)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        inArray(
          schema.contacts.id,
          removable.map((c) => c.id),
        ),
      );
    log(`soft-deleted ${removable.length} contacts`);
  }
  if (junkCandidates.length > 0) {
    await db
      .update(schema.mergeCandidates)
      .set({ status: "skipped", resolvedAt: now, updatedAt: now })
      .where(
        inArray(
          schema.mergeCandidates.id,
          junkCandidates.map((p) => p.id),
        ),
      );
    log(`dismissed ${junkCandidates.length} merge candidates`);
  }

  log("DONE");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
