import { describe, it, expect } from "vitest";
import { computeFreshness } from "@/lib/scoring/freshness";

const NOW = new Date("2026-04-27T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86400_000);

describe("computeFreshness", () => {
  it("unknown when no lastSeen", () => {
    const r = computeFreshness({ lastSeenAt: null, interactions365: 0 }, NOW);
    expect(r.band).toBe("unknown");
    expect(r.score).toBe(0);
  });
  it("fresh near today with any frequency", () => {
    const r = computeFreshness(
      { lastSeenAt: daysAgo(2), interactions365: 6 },
      NOW,
    );
    expect(r.band).toBe("fresh");
  });
  it("frequency lifts a stale lastSeen above pure recency", () => {
    const stale = computeFreshness(
      { lastSeenAt: daysAgo(120), interactions365: 0 },
      NOW,
    );
    const stale_freq = computeFreshness(
      { lastSeenAt: daysAgo(120), interactions365: 12 },
      NOW,
    );
    expect(stale_freq.score).toBeGreaterThan(stale.score);
  });
  it("dormant when ancient", () => {
    expect(
      computeFreshness({ lastSeenAt: daysAgo(900), interactions365: 0 }, NOW)
        .band,
    ).toBe("dormant");
  });
});
