import { describe, it, expect } from "vitest";
import { qualifiesForTriage, type TriageRules } from "@/lib/triage/eligibility";

const now = new Date("2026-06-17T00:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86400_000);

// The four presets the settings UI exposes.
const PRESETS: Record<string, TriageRules> = {
  oneTwoWay: { minTwoWay: 1, minTotal: 0, maxAgeDays: null },
  anyInteraction: { minTwoWay: 0, minTotal: 1, maxAgeDays: null },
  several: { minTwoWay: 3, minTotal: 0, maxAgeDays: null },
  showAll: { minTwoWay: 0, minTotal: 0, maxAgeDays: null },
};

describe("qualifiesForTriage", () => {
  it("default (one two-way) needs both a sent and a received message", () => {
    const r = PRESETS.oneTwoWay;
    expect(
      qualifiesForTriage(
        { inbound: 1, outbound: 1, total: 2, lastSeenAt: daysAgo(10) },
        r,
        now,
      ),
    ).toBe(true);
    // inbound-only (they emailed once, never replied) -> excluded
    expect(
      qualifiesForTriage(
        { inbound: 5, outbound: 0, total: 5, lastSeenAt: daysAgo(10) },
        r,
        now,
      ),
    ).toBe(false);
    // outbound-only (cold address-book entry you once emailed) -> excluded
    expect(
      qualifiesForTriage(
        { inbound: 0, outbound: 3, total: 3, lastSeenAt: daysAgo(10) },
        r,
        now,
      ),
    ).toBe(false);
    // never contacted at all -> excluded
    expect(
      qualifiesForTriage(
        { inbound: 0, outbound: 0, total: 0, lastSeenAt: null },
        r,
        now,
      ),
    ).toBe(false);
  });

  it("any-interaction preset admits a single one-directional touch", () => {
    const r = PRESETS.anyInteraction;
    expect(
      qualifiesForTriage(
        { inbound: 1, outbound: 0, total: 1, lastSeenAt: daysAgo(10) },
        r,
        now,
      ),
    ).toBe(true);
    expect(
      qualifiesForTriage(
        { inbound: 0, outbound: 0, total: 0, lastSeenAt: null },
        r,
        now,
      ),
    ).toBe(false);
  });

  it("several-exchanges preset needs min(inbound,outbound) >= 3", () => {
    const r = PRESETS.several;
    expect(
      qualifiesForTriage(
        { inbound: 4, outbound: 3, total: 7, lastSeenAt: daysAgo(10) },
        r,
        now,
      ),
    ).toBe(true);
    // 5 received but only 2 sent -> two-way strength is 2, below 3
    expect(
      qualifiesForTriage(
        { inbound: 5, outbound: 2, total: 7, lastSeenAt: daysAgo(10) },
        r,
        now,
      ),
    ).toBe(false);
  });

  it("show-everyone preset admits even zero-interaction contacts", () => {
    const r = PRESETS.showAll;
    expect(
      qualifiesForTriage(
        { inbound: 0, outbound: 0, total: 0, lastSeenAt: null },
        r,
        now,
      ),
    ).toBe(true);
  });

  it("recency window hides contacts older than maxAgeDays", () => {
    const r: TriageRules = { minTwoWay: 1, minTotal: 0, maxAgeDays: 365 };
    expect(
      qualifiesForTriage(
        { inbound: 1, outbound: 1, total: 2, lastSeenAt: daysAgo(100) },
        r,
        now,
      ),
    ).toBe(true);
    expect(
      qualifiesForTriage(
        { inbound: 1, outbound: 1, total: 2, lastSeenAt: daysAgo(400) },
        r,
        now,
      ),
    ).toBe(false);
    // qualifies on engagement but has no recorded date -> fails a recency window
    expect(
      qualifiesForTriage(
        { inbound: 1, outbound: 1, total: 2, lastSeenAt: null },
        r,
        now,
      ),
    ).toBe(false);
  });
});
