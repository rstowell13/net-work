/**
 * One-off cleanup: soft-delete contacts whose displayName is a business /
 * department / back-office name (Collections Department, Accounts Payable,
 * Customer Service, Do Not Reply, …) — see lib/contacts/business-name.ts.
 *
 * Operational, not part of the app bundle. Dry-run by default — pass --apply to
 * make changes. Reversible: undo with
 *   UPDATE contacts SET deleted_at = NULL WHERE …
 * Nothing is hard-deleted; raw_contacts and correspondence history are untouched.
 *
 * Run with:
 *   node --env-file=.env.local --conditions=react-server --import tsx scripts/remove-business-contacts.ts            # dry run
 *   node --env-file=.env.local --conditions=react-server --import tsx scripts/remove-business-contacts.ts --apply     # apply
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import {
  findRemovableBusinessContacts,
  sweepBusinessContacts,
} from "@/lib/contacts/business-contacts";

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

  const removable = await findRemovableBusinessContacts(u.id);
  const before = await toTriageCount(u.id);
  log(
    `business/department contacts removable: ${removable.length}  (to_triage before: ${before})`,
  );
  for (const c of removable) {
    log(`  REMOVE  ${c.displayName}  <${c.primaryEmail ?? "—"}>`);
  }

  if (!apply) {
    log("dry run — no changes made. Re-run with --apply to remove these.");
    process.exit(0);
  }

  const removed = await sweepBusinessContacts(u.id);
  const after = await toTriageCount(u.id);
  log(`soft-deleted ${removed} contacts  (to_triage now: ${after})`);
  log("DONE");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
