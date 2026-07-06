import { describe, it, expect } from "vitest";
import { computeFreshness, recencyDecay } from "@/lib/scoring/freshness";

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

describe("recencyDecay", () => {
  it("is 1 at day 0", () => {
    expect(recencyDecay(0)).toBe(1);
  });
  it("decays monotonically as days increase", () => {
    expect(recencyDecay(30)).toBeGreaterThan(recencyDecay(60));
    expect(recencyDecay(60)).toBeGreaterThan(recencyDecay(180));
    expect(recencyDecay(180)).toBeGreaterThan(recencyDecay(365));
  });
  it("is the same curve computeFreshness's recency term uses", () => {
    const NOW2 = new Date("2026-04-27T12:00:00Z");
    const days = 45;
    const lastSeenAt = new Date(NOW2.getTime() - days * 86400_000);
    const r = computeFreshness({ lastSeenAt, interactions365: 0 }, NOW2);
    const expectedScore = Math.round(0.7 * recencyDecay(days) * 100);
    expect(r.score).toBe(expectedScore);
  });
});
