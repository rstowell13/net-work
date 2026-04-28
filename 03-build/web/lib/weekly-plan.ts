import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { isoWeekOf, type IsoWeek } from "@/lib/iso-week";

async function getUserTz(userId: string): Promise<string> {
  const [u] = await db
    .select({ timezone: schema.users.timezone })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return u?.timezone ?? "UTC";
}

export async function currentWeek(userId: string): Promise<IsoWeek> {
  const tz = await getUserTz(userId);
  return isoWeekOf(new Date(), tz);
}

export async function getCurrentPlan(userId: string) {
  const w = await currentWeek(userId);
  const [plan] = await db
    .select()
    .from(schema.weeklyPlans)
    .where(
      and(
        eq(schema.weeklyPlans.userId, userId),
        eq(schema.weeklyPlans.isoYear, w.isoYear),
        eq(schema.weeklyPlans.isoWeek, w.isoWeek),
      ),
    )
    .limit(1);
  return { week: w, plan: plan ?? null };
}

export async function ensurePlan(userId: string) {
  const { week, plan } = await getCurrentPlan(userId);
  if (plan) return plan;
  const [created] = await db
    .insert(schema.weeklyPlans)
    .values({
      userId,
      isoYear: week.isoYear,
      isoWeek: week.isoWeek,
    })
    .returning();
  return created;
}

export async function commitPlan(
  userId: string,
  contactIds: string[],
  source: "suggestions_flow" | "add_to_this_week",
): Promise<{ planId: string; added: number }> {
  if (contactIds.length === 0) {
    const plan = await ensurePlan(userId);
    return { planId: plan.id, added: 0 };
  }
  const plan = await ensurePlan(userId);
  // Verify each contact belongs to this user.
  const owned = await db
    .select({ id: schema.contacts.id })
    .from(schema.contacts)
    .where(eq(schema.contacts.userId, userId));
  const ownedSet = new Set(owned.map((o) => o.id));
  const valid = contactIds.filter((id) => ownedSet.has(id));
  if (valid.length === 0) return { planId: plan.id, added: 0 };
  const rows = await db
    .insert(schema.weeklyPlanItems)
    .values(
      valid.map((contactId) => ({
        planId: plan.id,
        contactId,
        source,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: schema.weeklyPlanItems.id });
  return { planId: plan.id, added: rows.length };
}

export async function setItemStatus(
  userId: string,
  itemId: string,
  status: "not_yet_reached" | "reached" | "connected",
) {
  // Verify ownership via plan.
  const ownedPlanIds = db
    .select({ id: schema.weeklyPlans.id })
    .from(schema.weeklyPlans)
    .where(eq(schema.weeklyPlans.userId, userId));
  const update: Partial<typeof schema.weeklyPlanItems.$inferInsert> = {
    status,
  };
  if (status === "reached") update.reachedAt = new Date();
  if (status === "connected") {
    update.reachedAt = update.reachedAt ?? new Date();
    update.connectedAt = new Date();
  }
  if (status === "not_yet_reached") {
    update.reachedAt = null;
    update.connectedAt = null;
  }
  await db
    .update(schema.weeklyPlanItems)
    .set(update)
    .where(
      and(
        eq(schema.weeklyPlanItems.id, itemId),
        inArray(schema.weeklyPlanItems.planId, ownedPlanIds),
      ),
    );
}

export async function removeItem(userId: string, itemId: string) {
  const ownedPlanIds = db
    .select({ id: schema.weeklyPlans.id })
    .from(schema.weeklyPlans)
    .where(eq(schema.weeklyPlans.userId, userId));
  await db
    .delete(schema.weeklyPlanItems)
    .where(
      and(
        eq(schema.weeklyPlanItems.id, itemId),
        inArray(schema.weeklyPlanItems.planId, ownedPlanIds),
      ),
    );
}
