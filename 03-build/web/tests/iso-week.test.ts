import { describe, it, expect } from "vitest";
import { isoWeekOf, isoWeekBoundsUTC } from "@/lib/iso-week";

describe("isoWeekOf", () => {
  it("known dates", () => {
    expect(isoWeekOf(new Date("2026-01-01T12:00:00Z"))).toEqual({
      isoYear: 2026,
      isoWeek: 1,
    });
    // 2025-12-29 (Mon) is week 1 of 2026.
    expect(isoWeekOf(new Date("2025-12-29T12:00:00Z"))).toEqual({
      isoYear: 2026,
      isoWeek: 1,
    });
    // 2024-12-30 (Mon) is week 1 of 2025.
    expect(isoWeekOf(new Date("2024-12-30T12:00:00Z"))).toEqual({
      isoYear: 2025,
      isoWeek: 1,
    });
  });
});

describe("isoWeekBoundsUTC", () => {
  it("week 1 of 2026 starts Mon 2025-12-29", () => {
    const { start, end } = isoWeekBoundsUTC({ isoYear: 2026, isoWeek: 1 });
    expect(start.toISOString().slice(0, 10)).toBe("2025-12-29");
    expect(end.toISOString().slice(0, 10)).toBe("2026-01-04");
  });
});
