/**
 * Pure math for tag-driven outreach goals ("reach out to 1 volleyball friend
 * a month"). Kept side-effect-free and `now`-injected so it's unit-testable;
 * the DB plumbing lives in getCandidates().
 */
import { isoWeekOf, isoWeekBoundsUTC } from "@/lib/iso-week";

export type CadenceWindow = "week" | "month" | "quarter";

export interface TagCadenceRule {
  tagId: string;
  tagName: string;
  targetCount: number;
  window: CadenceWindow;
}

export interface TaggedContactSeen {
  tagId: string;
  lastSeenAt: Date | null;
}

export interface TagShortfall {
  tagId: string;
  tagName: string;
  window: CadenceWindow;
  target: number;
  reached: number;
  shortfall: number;
}

const WINDOW_LABEL: Record<CadenceWindow, string> = {
  week: "this week",
  month: "this month",
  quarter: "this quarter",
};

/** Start (UTC) of the current week / month / quarter containing `now`. */
export function windowStart(window: CadenceWindow, now: Date): Date {
  if (window === "week") {
    return isoWeekBoundsUTC(isoWeekOf(now)).start;
  }
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const startMonth = window === "quarter" ? Math.floor(m / 3) * 3 : m;
  return new Date(Date.UTC(y, startMonth, 1));
}

/**
 * For each rule, how many of its tagged contacts were contacted within the
 * rule's window, and the resulting shortfall (target − reached, floored at 0).
 */
export function computeTagShortfalls(
  rules: TagCadenceRule[],
  seen: TaggedContactSeen[],
  now: Date,
): Map<string, TagShortfall> {
  const out = new Map<string, TagShortfall>();
  for (const rule of rules) {
    const start = windowStart(rule.window, now);
    const reached = seen.filter(
      (s) =>
        s.tagId === rule.tagId &&
        s.lastSeenAt !== null &&
        s.lastSeenAt.getTime() >= start.getTime(),
    ).length;
    out.set(rule.tagId, {
      tagId: rule.tagId,
      tagName: rule.tagName,
      window: rule.window,
      target: rule.targetCount,
      reached,
      shortfall: Math.max(0, rule.targetCount - reached),
    });
  }
  return out;
}

/**
 * Ranking boost for a candidate based on the most under-served tag it carries.
 * Capped so it sharpens ordering without fully overriding freshness urgency.
 */
export function tagBoostFor(
  contactTagIds: string[],
  shortfalls: Map<string, TagShortfall>,
): { boost: number; reason: string | null } {
  let best: TagShortfall | null = null;
  for (const tagId of contactTagIds) {
    const sf = shortfalls.get(tagId);
    if (sf && sf.shortfall > 0 && (!best || sf.shortfall > best.shortfall)) {
      best = sf;
    }
  }
  if (!best) return { boost: 0, reason: null };
  return {
    boost: Math.min(30, best.shortfall * 20),
    reason: `${best.tagName}: ${best.reached} of ${best.target} ${WINDOW_LABEL[best.window]}`,
  };
}
