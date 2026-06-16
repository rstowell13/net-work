/**
 * Find and soft-delete "Unknown" junk contacts — records named exactly "Unknown"
 * (no source ever captured a name) that aren't a real relationship per
 * isRemovableUnknown. Used by scripts/remove-unknown-contacts.ts (one-off
 * cleanup) and by the rebuild finalize step (lib/rebuild.ts) so new ones don't
 * pile up in the triage queue.
 */
import "server-only";
import { and, eq, ne, isNull, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import {
  UNKNOWN_NAME,
  isRemovableUnknown,
  type UnknownActivity,
} from "./unknown-contacts-criteria";

export { UNKNOWN_NAME, isRemovableUnknown } from "./unknown-contacts-criteria";

export interface RemovableUnknown extends UnknownActivity {
  id: string;
  primaryEmail: string | null;
}

/**
 * Non-deleted, not-"kept" contacts named exactly "Unknown" that fail the
 * keep-rule. Activity is counted in two small grouped queries and merged in JS —
 * the same style as the aggregates in lib/contacts/queries.ts — so the rule
 * (isRemovableUnknown) stays the single source of truth.
 */
export async function findRemovableUnknownContacts(
  userId: string,
): Promise<RemovableUnknown[]> {
  const unknowns = await db
    .select({
      id: schema.contacts.id,
      primaryEmail: schema.contacts.primaryEmail,
    })
    .from(schema.contacts)
    .where(
      and(
        eq(schema.contacts.userId, userId),
        isNull(schema.contacts.deletedAt),
        eq(schema.contacts.displayName, UNKNOWN_NAME),
        ne(schema.contacts.triageStatus, "kept"),
      ),
    );
  const ids = unknowns.map((c) => c.id);
  if (ids.length === 0) return [];

  // 1-on-1 text messages per contact (group-chat messages excluded).
  const msgRows = await db
    .select({
      id: schema.messages.contactId,
      n: sql<number>`count(*)::int`,
    })
    .from(schema.messages)
    .where(
      and(
        inArray(schema.messages.contactId, ids),
        eq(schema.messages.isGroup, false),
      ),
    )
    .groupBy(schema.messages.contactId);
  const msg1on1 = new Map<string, number>();
  for (const r of msgRows) if (r.id) msg1on1.set(r.id, r.n);

  // Email counts per contact, split by direction.
  const emlRows = await db
    .select({
      id: schema.emails.contactId,
      direction: schema.emails.direction,
      n: sql<number>`count(*)::int`,
    })
    .from(schema.emails)
    .where(inArray(schema.emails.contactId, ids))
    .groupBy(schema.emails.contactId, schema.emails.direction);
  const emlIn = new Map<string, number>();
  const emlOut = new Map<string, number>();
  for (const r of emlRows) {
    if (!r.id) continue;
    if (r.direction === "inbound") emlIn.set(r.id, r.n);
    else emlOut.set(r.id, r.n);
  }

  return unknowns
    .map((c) => ({
      id: c.id,
      primaryEmail: c.primaryEmail,
      messages1on1: msg1on1.get(c.id) ?? 0,
      inboundEmail: emlIn.get(c.id) ?? 0,
      outboundEmail: emlOut.get(c.id) ?? 0,
    }))
    .filter(isRemovableUnknown);
}

/** Soft-delete the removable "Unknown" contacts. Returns the count removed. */
export async function sweepUnknownContacts(userId: string): Promise<number> {
  const removable = await findRemovableUnknownContacts(userId);
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
