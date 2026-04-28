import "server-only";
import { and, count, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { computeFreshness } from "@/lib/scoring/freshness";
import { listContacts, type ContactListRow } from "@/lib/contacts/queries";
import { getCurrentPlan } from "@/lib/weekly-plan";
import type { HomePlanItem } from "@/components/HomePlan";

export interface HomeData {
  hasPlan: boolean;
  weekRange: string;
  daysRemaining: number;
  reached: number;
  connected: number;
  total: number;
  openFollowUps: number;
  overdueFollowUps: number;
  triagedCount: number;
  totalContacts: number;
  items: HomePlanItem[];
  attention: {
    triageQueue: number;
    mergeSuggestions: number;
  };
}

export async function getHomeData(userId: string): Promise<HomeData> {
  const { week, plan } = await getCurrentPlan(userId);
  const items: HomePlanItem[] = [];
  let reached = 0;
  let connected = 0;

  // Pre-fetch all kept contacts for freshness/lastSeen lookup.
  const contactIndex = new Map<string, ContactListRow>();
  const all = await listContacts(userId, { status: "all" }, 2000);
  for (const c of all) contactIndex.set(c.id, c);

  if (plan) {
    const rows = await db
      .select({
        itemId: schema.weeklyPlanItems.id,
        contactId: schema.weeklyPlanItems.contactId,
        status: schema.weeklyPlanItems.status,
        displayName: schema.contacts.displayName,
        photoUrl: schema.contacts.photoUrl,
        category: schema.contacts.category,
      })
      .from(schema.weeklyPlanItems)
      .innerJoin(
        schema.contacts,
        eq(schema.contacts.id, schema.weeklyPlanItems.contactId),
      )
      .where(eq(schema.weeklyPlanItems.planId, plan.id))
      .orderBy(schema.weeklyPlanItems.createdAt);

    for (const r of rows) {
      if (r.status === "reached" || r.status === "connected") reached++;
      if (r.status === "connected") connected++;
      const idx = contactIndex.get(r.contactId);
      items.push({
        itemId: r.itemId,
        contactId: r.contactId,
        displayName: r.displayName,
        photoUrl: r.photoUrl,
        category: r.category,
        status: r.status,
        daysSince: idx?.freshness.daysSince ?? null,
        freshness:
          idx?.freshness ??
          computeFreshness({ lastSeenAt: null, interactions365: 0 }),
        context: contextFor(r.status),
      });
    }
  }

  // Counts.
  const [followUpsOpen] = await db
    .select({ n: count() })
    .from(schema.followUps)
    .innerJoin(
      schema.contacts,
      eq(schema.contacts.id, schema.followUps.contactId),
    )
    .where(
      and(
        eq(schema.contacts.userId, userId),
        eq(schema.followUps.status, "open"),
        isNull(schema.followUps.deletedAt),
      ),
    );
  const [triageRow] = await db
    .select({ n: count() })
    .from(schema.contacts)
    .where(
      and(
        eq(schema.contacts.userId, userId),
        eq(schema.contacts.triageStatus, "to_triage"),
        isNull(schema.contacts.deletedAt),
      ),
    );
  const [allRow] = await db
    .select({ n: count() })
    .from(schema.contacts)
    .where(
      and(
        eq(schema.contacts.userId, userId),
        isNull(schema.contacts.deletedAt),
      ),
    );
  const [mergeRow] = await db
    .select({ n: count() })
    .from(schema.mergeCandidates)
    .where(
      and(
        eq(schema.mergeCandidates.userId, userId),
        eq(schema.mergeCandidates.status, "pending"),
      ),
    );

  // Days remaining in ISO week (Sun = day 7).
  const now = new Date();
  const dow = now.getDay() || 7;
  const daysRemaining = 7 - dow;

  const weekRange = `Week ${week.isoWeek}, ${week.isoYear}`;

  return {
    hasPlan: !!plan,
    weekRange,
    daysRemaining,
    reached,
    connected,
    total: items.length,
    openFollowUps: followUpsOpen?.n ?? 0,
    overdueFollowUps: 0,
    triagedCount: (allRow?.n ?? 0) - (triageRow?.n ?? 0),
    totalContacts: allRow?.n ?? 0,
    items,
    attention: {
      triageQueue: triageRow?.n ?? 0,
      mergeSuggestions: mergeRow?.n ?? 0,
    },
  };
}

function contextFor(status: string): string {
  switch (status) {
    case "connected":
      return "Connected this week — nice.";
    case "reached":
      return "Reached out. Waiting on a reply.";
    default:
      return "Plan to reach out this week.";
  }
}
