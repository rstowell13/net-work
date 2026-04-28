import "server-only";
import { and, eq, inArray, isNull, notInArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { listContacts } from "@/lib/contacts/queries";
import { ensurePlan } from "@/lib/weekly-plan";

export interface SuggestionCandidate {
  contactId: string;
  displayName: string;
  primaryEmail: string | null;
  primaryPhone: string | null;
  photoUrl: string | null;
  category: "personal" | "business" | "both" | null;
  freshness: number; // 0..100
  band: string;
  daysSince: number | null;
  score: number; // composite ranking
  reason: string;
}

interface CadenceSettings {
  targetPerWeek: number;
  personalPct: number;
  minDaysSinceLastContact: number;
}

export async function getCadence(userId: string): Promise<CadenceSettings> {
  const [r] = await db
    .select()
    .from(schema.cadenceRules)
    .where(eq(schema.cadenceRules.userId, userId))
    .limit(1);
  if (r) {
    return {
      targetPerWeek: r.targetPerWeek,
      personalPct: r.personalPct,
      minDaysSinceLastContact: r.minDaysSinceLastContact,
    };
  }
  return { targetPerWeek: 5, personalPct: 60, minDaysSinceLastContact: 30 };
}

export async function upsertCadence(
  userId: string,
  patch: Partial<CadenceSettings>,
): Promise<CadenceSettings> {
  const cur = await getCadence(userId);
  const next = { ...cur, ...patch };
  await db
    .insert(schema.cadenceRules)
    .values({
      userId,
      targetPerWeek: next.targetPerWeek,
      personalPct: next.personalPct,
      minDaysSinceLastContact: next.minDaysSinceLastContact,
    })
    .onConflictDoUpdate({
      target: schema.cadenceRules.userId,
      set: {
        targetPerWeek: next.targetPerWeek,
        personalPct: next.personalPct,
        minDaysSinceLastContact: next.minDaysSinceLastContact,
        updatedAt: new Date(),
      },
    });
  return next;
}

export async function getCandidates(
  userId: string,
  limit = 12,
): Promise<{
  cadence: CadenceSettings;
  candidates: SuggestionCandidate[];
}> {
  const cadence = await getCadence(userId);

  // Pool: kept contacts not flagged "never" suggested.
  const pool = await listContacts(
    userId,
    { status: "kept" },
    1000,
  );

  // Filter out contacts already in the current plan.
  const plan = await ensurePlan(userId);
  const inPlan = await db
    .select({ contactId: schema.weeklyPlanItems.contactId })
    .from(schema.weeklyPlanItems)
    .where(eq(schema.weeklyPlanItems.planId, plan.id));
  const inPlanSet = new Set(inPlan.map((r) => r.contactId));

  // Filter out suggestion_status='never'.
  const neverIds = new Set(
    (
      await db
        .select({ id: schema.contacts.id })
        .from(schema.contacts)
        .where(
          and(
            eq(schema.contacts.userId, userId),
            eq(schema.contacts.suggestionStatus, "never"),
          ),
        )
    ).map((r) => r.id),
  );

  const eligible = pool.filter(
    (c) =>
      !inPlanSet.has(c.id) &&
      !neverIds.has(c.id) &&
      (c.lastSeenAt === null ||
        Math.floor(
          (Date.now() - c.lastSeenAt.getTime()) / 86400_000,
        ) >= cadence.minDaysSinceLastContact),
  );

  // Ranking: prefer contacts whose freshness is low (calling for attention)
  // but not so dormant we have no signal. Boost matches the cadence's
  // personal/business mix versus what's already in the plan.
  const personalSlots = Math.round(
    cadence.targetPerWeek * (cadence.personalPct / 100),
  );
  const businessSlots = cadence.targetPerWeek - personalSlots;
  const inPlanContacts = pool.filter((c) => inPlanSet.has(c.id));
  const planPersonal = inPlanContacts.filter(
    (c) => c.category === "personal",
  ).length;
  const planBusiness = inPlanContacts.filter(
    (c) => c.category === "business" || c.category === "both",
  ).length;
  const needPersonal = Math.max(0, personalSlots - planPersonal);
  const needBusiness = Math.max(0, businessSlots - planBusiness);

  const ranked: SuggestionCandidate[] = eligible
    .map((c) => {
      // Score: low freshness draws urgency, but unknown freshness shouldn't
      // dominate. Pin unknown to mid-range so they show up but don't lead.
      const f = c.freshness.score;
      const urgency = c.freshness.band === "unknown" ? 35 : 100 - f;
      let categoryBoost = 0;
      if (c.category === "personal" && needPersonal > 0) categoryBoost = 15;
      if ((c.category === "business" || c.category === "both") && needBusiness > 0)
        categoryBoost = 15;
      const score = urgency + categoryBoost;
      const reason =
        c.freshness.daysSince !== null
          ? `${c.freshness.daysSince}d since last contact`
          : "no recorded contact yet";
      return {
        contactId: c.id,
        displayName: c.displayName,
        primaryEmail: c.primaryEmail,
        primaryPhone: c.primaryPhone,
        photoUrl: c.photoUrl,
        category: c.category,
        freshness: f,
        band: c.freshness.band,
        daysSince: c.freshness.daysSince,
        score,
        reason,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return { cadence, candidates: ranked };
}

// keep import used in case the linter complains
const _unused = { isNull, inArray, notInArray };
void _unused;
