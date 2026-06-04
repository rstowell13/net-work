import { describe, it, expect } from "vitest";
import {
  windowStart,
  computeTagShortfalls,
  tagBoostFor,
  type TagCadenceRule,
} from "@/lib/suggestions/tag-cadence";

const NOW = new Date("2026-06-15T12:00:00Z"); // Mon-anchored June, Q2

describe("windowStart", () => {
  it("month → first of the current month (UTC)", () => {
    expect(windowStart("month", NOW).toISOString().slice(0, 10)).toBe(
      "2026-06-01",
    );
  });
  it("quarter → first of the current quarter (UTC)", () => {
    expect(windowStart("quarter", NOW).toISOString().slice(0, 10)).toBe(
      "2026-04-01",
    );
  });
  it("week → the ISO-week Monday", () => {
    // 2026-06-15 is a Monday, so the week starts that day.
    expect(windowStart("week", NOW).toISOString().slice(0, 10)).toBe(
      "2026-06-15",
    );
  });
});

const rules: TagCadenceRule[] = [
  { tagId: "vb", tagName: "volleyball", targetCount: 1, window: "month" },
  { tagId: "col", tagName: "college", targetCount: 2, window: "month" },
];

describe("computeTagShortfalls", () => {
  it("counts only contacts seen within the window", () => {
    const seen = [
      { tagId: "vb", lastSeenAt: new Date("2026-06-10T00:00:00Z") }, // in window
      { tagId: "vb", lastSeenAt: new Date("2026-05-20T00:00:00Z") }, // before window
      { tagId: "vb", lastSeenAt: null }, // never
    ];
    const sf = computeTagShortfalls(rules, seen, NOW);
    expect(sf.get("vb")).toMatchObject({ reached: 1, shortfall: 0 });
  });
  it("reports a shortfall when the target is unmet", () => {
    const sf = computeTagShortfalls(rules, [], NOW);
    expect(sf.get("col")).toMatchObject({ target: 2, reached: 0, shortfall: 2 });
  });
});

describe("tagBoostFor", () => {
  it("returns no boost when the contact carries no under-served tag", () => {
    const sf = computeTagShortfalls(rules, [], NOW);
    expect(tagBoostFor([], sf)).toEqual({ boost: 0, reason: null });
    // tag with shortfall 0 yields nothing
    const met = computeTagShortfalls(
      [{ tagId: "vb", tagName: "volleyball", targetCount: 1, window: "month" }],
      [{ tagId: "vb", lastSeenAt: NOW }],
      NOW,
    );
    expect(tagBoostFor(["vb"], met).boost).toBe(0);
  });
  it("boosts and explains, picking the largest shortfall", () => {
    const sf = computeTagShortfalls(rules, [], NOW);
    const r = tagBoostFor(["vb", "col"], sf);
    expect(r.boost).toBeGreaterThan(0);
    expect(r.reason).toContain("college"); // shortfall 2 > 1
    expect(r.reason).toContain("this month");
  });
});
