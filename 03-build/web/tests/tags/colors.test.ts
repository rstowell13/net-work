import { describe, it, expect } from "vitest";
import {
  TAG_PALETTE,
  nextTagColor,
  normalizeTagName,
  tagChipStyle,
} from "@/lib/tags/colors";

describe("nextTagColor", () => {
  it("cycles through the palette by count", () => {
    expect(nextTagColor(0)).toBe(TAG_PALETTE[0]);
    expect(nextTagColor(1)).toBe(TAG_PALETTE[1]);
    expect(nextTagColor(TAG_PALETTE.length)).toBe(TAG_PALETTE[0]);
    expect(nextTagColor(TAG_PALETTE.length + 3)).toBe(TAG_PALETTE[3]);
  });
  it("only ever returns palette colors", () => {
    for (let i = 0; i < 50; i++) {
      expect(TAG_PALETTE).toContain(nextTagColor(i));
    }
  });
});

describe("normalizeTagName", () => {
  it("trims and collapses internal whitespace", () => {
    expect(normalizeTagName("  volleyball ")).toBe("volleyball");
    expect(normalizeTagName("college  friends")).toBe("college friends");
  });
  it("preserves case for display", () => {
    expect(normalizeTagName("BYU Volleyball")).toBe("BYU Volleyball");
  });
});

describe("tagChipStyle", () => {
  it("derives a tinted background + ink-blended text from the hue", () => {
    const s = tagChipStyle("#5a7a3a");
    expect(s.background).toContain("#5a7a3a");
    expect(s.background).toContain("color-mix");
    expect(s.color).toContain("var(--ink)");
  });
  it("falls back to muted tokens when no hue is set", () => {
    const s = tagChipStyle(null);
    expect(s.color).toBe("var(--ink-muted)");
  });
});
