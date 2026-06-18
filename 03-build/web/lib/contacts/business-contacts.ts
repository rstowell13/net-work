/**
 * Find and soft-delete business / department contacts — records whose displayName
 * is a back-office/automated name per isBusinessName (Collections Department,
 * Accounts Payable, Customer Service, Do Not Reply, …). Used by
 * scripts/remove-business-contacts.ts (one-off cleanup) and the rebuild finalize
 * step (lib/rebuild.ts) so new ones don't pile up in the triage queue.
 */
import "server-only";
import { and, eq, ne, isNull, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { isBusinessName } from "./business-name";

export { isBusinessName } from "./business-name";

export interface RemovableBusiness {
  id: string;
  displayName: string;
  primaryEmail: string | null;
}

/**
 * Non-deleted, not-"kept" contacts whose displayName reads as a business /
 * department. The name rule (isBusinessName) is the single source of truth and is
 * applied in JS over the contact rows — cheap (~1k rows, a regex each).
 */
export async function findRemovableBusinessContacts(
  userId: string,
): Promise<RemovableBusiness[]> {
  const rows = await db
    .select({
      id: schema.contacts.id,
      displayName: schema.contacts.displayName,
      primaryEmail: schema.contacts.primaryEmail,
    })
    .from(schema.contacts)
    .where(
      and(
        eq(schema.contacts.userId, userId),
        isNull(schema.contacts.deletedAt),
        ne(schema.contacts.triageStatus, "kept"),
      ),
    );
  return rows.filter((c) => isBusinessName(c.displayName));
}

/** Soft-delete the business/department contacts. Returns the count removed. */
export async function sweepBusinessContacts(userId: string): Promise<number> {
  const removable = await findRemovableBusinessContacts(userId);
  if (removable.length === 0) return 0;
  const now = new Date();
  await db
    .update(schema.contacts)
    .set({ deletedAt: now, updatedAt: now })
    .where(
      inArray(
        schema.contacts.id,
        removable.map((c) => c.id),
      ),
    );
  return removable.length;
}
