/**
 * Freshness scoring — recency + frequency.
 *
 * Score blends two factors:
 *   - recency: how long ago the last interaction was (exponential decay).
 *   - frequency: how many interactions occurred in the last 365 days
 *     (logarithmic). Caps frequency contribution so a single old contact
 *     can't outweigh a recent rapport.
 *
 * Output: 0..100 with a labelled band.
 */
export type FreshnessBand =
  | "fresh"
  | "warm"
  | "fading"
  | "cold"
  | "dormant"
  | "unknown";

export interface FreshnessResult {
  score: number;
  band: FreshnessBand;
  daysSince: number | null;
  interactions365: number;
}

const BAND_CUTOFFS: Array<[number, FreshnessBand]> = [
  [80, "fresh"],
  [60, "warm"],
  [40, "fading"],
  [20, "cold"],
  [0, "dormant"],
];

export interface FreshnessInputs {
  lastSeenAt: Date | null;
  interactions365: number; // count of msg/email/call/event in last 365d
}

export function computeFreshness(
  inputs: FreshnessInputs,
  now: Date = new Date(),
): FreshnessResult {
  const { lastSeenAt, interactions365 } = inputs;
  if (!lastSeenAt) {
    return { score: 0, band: "unknown", daysSince: null, interactions365: 0 };
  }
  const days = Math.max(
    0,
    Math.floor((now.getTime() - lastSeenAt.getTime()) / 86400_000),
  );
  // Recency: exponential decay; half-life ~125 days.
  const recency = Math.exp(-days / 180);
  // Frequency: 0 → 0; 1 → ~0.3; 5 → ~0.7; 20+ → ~1. log scale.
  const freq = Math.min(1, Math.log1p(interactions365) / Math.log(20));
  // Blend 70/30 — recency dominates because old-but-frequent doesn't beat
  // a recent reach-out for the "should I touch base?" question.
  const score = Math.round((0.7 * recency + 0.3 * freq) * 100);
  const band =
    BAND_CUTOFFS.find(([cutoff]) => score >= cutoff)?.[1] ?? "dormant";
  return { score, band, daysSince: days, interactions365 };
}

export function bandColor(band: FreshnessBand): string {
  switch (band) {
    case "fresh":
    case "warm":
      return "var(--fresh-green)";
    case "fading":
      return "var(--fading-yellow)";
    case "cold":
    case "dormant":
      return "var(--cold-red)";
    case "unknown":
      return "var(--ink-faint)";
  }
}

export function bandLabel(band: FreshnessBand): string {
  return band === "unknown" ? "—" : band[0].toUpperCase() + band.slice(1);
}
