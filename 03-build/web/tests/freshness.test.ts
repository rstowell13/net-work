import { describe, it, expect } from "vitest";
import { computeFreshness } from "@/lib/scoring/freshness";

const NOW = new Date("2026-04-27T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86400_000);

describe("computeFreshness", () => {
  it("unknown when no lastSeen", () => {
    const r = computeFreshness(null, NOW);
    expect(r.band).toBe("unknown");
    expect(r.score).toBe(0);
  });
  it("fresh near today", () => {
    expect(computeFreshness(daysAgo(0), NOW).band).toBe("fresh");
  });
  it("warm at ~30 days", () => {
    const b = computeFreshness(daysAgo(30), NOW).band;
    expect(["fresh", "warm"]).toContain(b);
  });
  it("fading around 90 days", () => {
    const b = computeFreshness(daysAgo(120), NOW).band;
    expect(["warm", "fading"]).toContain(b);
  });
  it("cold around 365 days", () => {
    const b = computeFreshness(daysAgo(365), NOW).band;
    expect(["fading", "cold", "dormant"]).toContain(b);
  });
  it("dormant after 2 years", () => {
    expect(computeFreshness(daysAgo(900), NOW).band).toBe("dormant");
  });
});
