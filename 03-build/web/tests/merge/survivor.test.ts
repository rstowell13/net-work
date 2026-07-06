import { describe, it, expect } from "vitest";
import { rankSurvivorId } from "@/lib/merge/survivor-rank";

const d = (iso: string) => new Date(iso);
const row = (
  id: string,
  over: Partial<{
    triageStatus: string;
    category: string | null;
    createdAt: Date;
  }> = {},
) => ({
  id,
  triageStatus: "to_triage",
  category: null,
  createdAt: d("2026-01-01T00:00:00Z"),
  ...over,
});

describe("rankSurvivorId", () => {
  it("returns null for an empty list", () => {
    expect(rankSurvivorId([], new Map())).toBeNull();
  });

  it("a human 'kept' decision outranks everything else", () => {
    const rows = [
      row("skipped", { triageStatus: "skipped", category: "personal" }),
      row("kept", { triageStatus: "kept" }),
      row("untriaged", { triageStatus: "to_triage", category: "business" }),
    ];
    const counts = new Map([
      ["skipped", 10],
      ["untriaged", 10],
      ["kept", 1],
    ]);
    expect(rankSurvivorId(rows, counts)).toBe("kept");
  });

  it("has-category beats no-category at equal triage rank", () => {
    const rows = [
      row("plain"),
      row("categorized", { category: "personal" }),
    ];
    expect(rankSurvivorId(rows, new Map())).toBe("categorized");
  });

  it("more raw records wins at equal triage/category", () => {
    const rows = [row("small"), row("big")];
    const counts = new Map([
      ["small", 1],
      ["big", 4],
    ]);
    expect(rankSurvivorId(rows, counts)).toBe("big");
  });

  it("oldest contact wins as the final tiebreak", () => {
    const rows = [
      row("newer", { createdAt: d("2026-06-01T00:00:00Z") }),
      row("older", { createdAt: d("2025-06-01T00:00:00Z") }),
    ];
    expect(rankSurvivorId(rows, new Map())).toBe("older");
  });

  it("unknown triage status ranks below skipped", () => {
    const rows = [
      row("weird", { triageStatus: "something_else" }),
      row("skipped", { triageStatus: "skipped" }),
    ];
    expect(rankSurvivorId(rows, new Map())).toBe("skipped");
  });
});
