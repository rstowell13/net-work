/**
 * Moving a contact's curated, contact-level content between contacts during a
 * merge/partition. Runs inside the caller's transaction. Diary
 * (messages/emails/calls/calendar) is keyed by handle and handled separately
 * by the caller (moved directly, or nulled + relinked).
 */
import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Move tags, follow-ups, notes, plan items from one or more source contacts
 * onto a target, handling the PK/unique-constrained tables; derived tables
 * (suggestion state, relationship summaries) are dropped and regenerate.
 */
export async function moveCuratedContent(
  tx: Tx,
  fromContactIds: string[],
  toContactId: string,
): Promise<void> {
  if (fromContactIds.length === 0) return;
  const now = new Date();

  // contact_tags — PK (contact_id, tag_id): add only tags the target lacks.
  const targetTags = await tx
    .select({ tagId: schema.contactTags.tagId })
    .from(schema.contactTags)
    .where(eq(schema.contactTags.contactId, toContactId));
  const targetSet = new Set(targetTags.map((t) => t.tagId));
  const fromTags = await tx
    .select({ tagId: schema.contactTags.tagId })
    .from(schema.contactTags)
    .where(inArray(schema.contactTags.contactId, fromContactIds));
  const addTags = [...new Set(fromTags.map((t) => t.tagId))].filter(
    (t) => !targetSet.has(t),
  );
  await tx
    .delete(schema.contactTags)
    .where(inArray(schema.contactTags.contactId, fromContactIds));
  if (addTags.length > 0) {
    await tx
      .insert(schema.contactTags)
      .values(addTags.map((tagId) => ({ contactId: toContactId, tagId })));
  }

  // Plain moves (no uniqueness on contact_id).
  await tx
    .update(schema.followUps)
    .set({ contactId: toContactId, updatedAt: now })
    .where(inArray(schema.followUps.contactId, fromContactIds));
  await tx
    .update(schema.notes)
    .set({ contactId: toContactId, updatedAt: now })
    .where(inArray(schema.notes.contactId, fromContactIds));

  // Derived tables — drop; they regenerate.
  await tx
    .delete(schema.suggestionState)
    .where(inArray(schema.suggestionState.contactId, fromContactIds));
  await tx
    .delete(schema.relationshipSummaries)
    .where(inArray(schema.relationshipSummaries.contactId, fromContactIds));

  // weekly_plan_items — UNIQUE (plan_id, contact_id): move one per plan the
  // target isn't already in; drop the rest.
  const targetPlans = await tx
    .select({ planId: schema.weeklyPlanItems.planId })
    .from(schema.weeklyPlanItems)
    .where(eq(schema.weeklyPlanItems.contactId, toContactId));
  const claimed = new Set(targetPlans.map((p) => p.planId));
  const items = await tx
    .select({
      id: schema.weeklyPlanItems.id,
      planId: schema.weeklyPlanItems.planId,
    })
    .from(schema.weeklyPlanItems)
    .where(inArray(schema.weeklyPlanItems.contactId, fromContactIds));
  const moveItemIds: string[] = [];
  const dropItemIds: string[] = [];
  for (const it of items) {
    if (claimed.has(it.planId)) dropItemIds.push(it.id);
    else {
      claimed.add(it.planId);
      moveItemIds.push(it.id);
    }
  }
  if (moveItemIds.length > 0) {
    await tx
      .update(schema.weeklyPlanItems)
      .set({ contactId: toContactId })
      .where(inArray(schema.weeklyPlanItems.id, moveItemIds));
  }
  if (dropItemIds.length > 0) {
    await tx
      .delete(schema.weeklyPlanItems)
      .where(inArray(schema.weeklyPlanItems.id, dropItemIds));
  }
}
