/**
 * Recency-only proxy freshness score for M5 — full recency+frequency formula
 * lands in M6. Kept pure so a unit test pins the bands.
 */
export type FreshnessBand =
  | "fresh"
  | "warm"
  | "fading"
  | "cold"
  | "dormant"
  | "unknown";

export interface FreshnessResult {
  score: number; // 0..100
  band: FreshnessBand;
  daysSince: number | null;
}

const BAND_CUTOFFS: Array<[number, FreshnessBand]> = [
  [80, "fresh"],
  [60, "warm"],
  [40, "fading"],
  [20, "cold"],
  [0, "dormant"],
];

export function computeFreshness(
  lastSeenAt: Date | null,
  now: Date = new Date(),
): FreshnessResult {
  if (!lastSeenAt) return { score: 0, band: "unknown", daysSince: null };
  const days = Math.max(
    0,
    Math.floor(
      (now.getTime() - lastSeenAt.getTime()) / (1000 * 60 * 60 * 24),
    ),
  );
  // 0 days → 100; 14 days → ~80; 90 days → ~50; 365 days → ~20; 730+ → ~0.
  const decay = Math.exp(-days / 180);
  const score = Math.round(decay * 100);
  const band =
    BAND_CUTOFFS.find(([cutoff]) => score >= cutoff)?.[1] ?? "dormant";
  return { score, band, daysSince: days };
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
