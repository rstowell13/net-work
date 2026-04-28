import { describe, it, expect } from "vitest";
import { avatarColorIndex } from "@/lib/avatar-color";

describe("avatarColorIndex", () => {
  it("is deterministic", () => {
    expect(avatarColorIndex("contact-abc")).toBe(avatarColorIndex("contact-abc"));
  });
  it("is in 1..10", () => {
    for (const id of ["a", "bb", "ccc", "long-uuid-1234", "x"]) {
      const n = avatarColorIndex(id);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(10);
    }
  });
  it("distributes across the palette", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) seen.add(avatarColorIndex(`id-${i}`));
    expect(seen.size).toBe(10);
  });
});
