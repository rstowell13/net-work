/**
 * One-off cleanup: soft-delete contacts named exactly "Unknown" that aren't a
 * real relationship (no 1-on-1 text and no two-way email) — see
 * lib/contacts/unknown-contacts-criteria.ts for the rule.
 *
 * Operational, not part of the app bundle. Dry-run by default — pass --apply to
 * make changes. Reversible: undo with
 *   UPDATE contacts SET deleted_at = NULL WHERE …
 * Nothing is hard-deleted; raw_contacts and correspondence history are untouched.
 *
 * Run with:
 *   node --env-file=.env.local --conditions=react-server --import tsx scripts/remove-unknown-contacts.ts            # dry run
 *   node --env-file=.env.local --conditions=react-server --import tsx scripts/remove-unknown-contacts.ts --apply     # apply
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import {
  findRemovableUnknownContacts,
  sweepUnknownContacts,
} from "@/lib/contacts/unknown-contacts";
import { getOwner, log } from "./_shared";

async function toTriageCount(userId: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.contacts)
    .where(
      and(
        eq(schema.contacts.userId, userId),
        eq(schema.contacts.triageStatus, "to_triage"),
        isNull(schema.contacts.deletedAt),
      ),
    );
  return r?.n ?? 0;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const u = await getOwner();
  log("owner", u.email, u.id, apply ? "(APPLY)" : "(dry run)");

  const removable = await findRemovableUnknownContacts(u.id);
  const before = await toTriageCount(u.id);
  log(
    `"Unknown" contacts removable: ${removable.length}  (to_triage before: ${before})`,
  );
  for (const c of removable) {
    log(
      `  REMOVE  ${c.primaryEmail ?? "—"}  [1on1=${c.messages1on1} in=${c.inboundEmail} out=${c.outboundEmail}]`,
    );
  }

  if (!apply) {
    log("dry run — no changes made. Re-run with --apply to remove these.");
    process.exit(0);
  }

  const removed = await sweepUnknownContacts(u.id);
  const after = await toTriageCount(u.id);
  log(`soft-deleted ${removed} contacts  (to_triage now: ${after})`);
  log("DONE");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
