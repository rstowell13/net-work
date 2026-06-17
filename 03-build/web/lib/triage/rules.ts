import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { TriageRules } from "@/lib/triage/eligibility";

// Default bar: one two-way exchange, no time limit. Matches the schema
// column defaults so a missing row behaves identically to an unsaved one.
export const DEFAULT_TRIAGE_RULES: TriageRules = {
  minTwoWay: 1,
  minTotal: 0,
  maxAgeDays: null,
};

export async function getTriageRules(userId: string): Promise<TriageRules> {
  const [r] = await db
    .select()
    .from(schema.triageRules)
    .where(eq(schema.triageRules.userId, userId))
    .limit(1);
  if (r) {
    return {
      minTwoWay: r.minTwoWay,
      minTotal: r.minTotal,
      maxAgeDays: r.maxAgeDays,
    };
  }
  return { ...DEFAULT_TRIAGE_RULES };
}

export async function upsertTriageRules(
  userId: string,
  patch: Partial<TriageRules>,
): Promise<TriageRules> {
  const cur = await getTriageRules(userId);
  const next = { ...cur, ...patch };
  await db
    .insert(schema.triageRules)
    .values({
      userId,
      minTwoWay: next.minTwoWay,
      minTotal: next.minTotal,
      maxAgeDays: next.maxAgeDays,
    })
    .onConflictDoUpdate({
      target: schema.triageRules.userId,
      set: {
        minTwoWay: next.minTwoWay,
        minTotal: next.minTotal,
        maxAgeDays: next.maxAgeDays,
        updatedAt: new Date(),
      },
    });
  return next;
}
