import { describe, it, expect } from "vitest";
import { mergeRecentInteractions } from "@/lib/contacts/recent";

const d = (s: string) => new Date(s);

describe("mergeRecentInteractions", () => {
  it("merges all four channels, newest first, capped at 3", () => {
    const out = mergeRecentInteractions({
      messages: [{ sentAt: d("2026-01-10"), body: "hey" }],
      emails: [{ sentAt: d("2026-04-02"), subject: "Term sheet" }],
      calls: [{ startedAt: d("2026-02-01"), durationSeconds: 180 }],
      calendar: [{ startsAt: d("2026-03-11"), title: "Intro call" }],
    });
    expect(out.map((r) => r.channel)).toEqual(["email", "calendar", "call"]);
    expect(out[0].preview).toBe("Term sheet");
    expect(out[1].preview).toBe("Intro call");
    expect(out[2].preview).toBe("3-minute call");
  });

  it("includes calendar events in the feed", () => {
    const out = mergeRecentInteractions({
      messages: [],
      emails: [],
      calls: [],
      calendar: [{ startsAt: d("2026-03-11"), title: "Cap13 / Northwind" }],
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ channel: "calendar", preview: "Cap13 / Northwind" });
  });

  it("handles empty bodies and missing subjects gracefully", () => {
    const out = mergeRecentInteractions({
      messages: [{ sentAt: d("2026-01-02"), body: null }],
      emails: [{ sentAt: d("2026-01-01"), subject: null }],
      calls: [],
      calendar: [],
    });
    expect(out[0].preview).toBe("(no text)");
    expect(out[1].preview).toBe("(no subject)");
  });

  it("returns an empty array when there is no history", () => {
    expect(
      mergeRecentInteractions({ messages: [], emails: [], calls: [], calendar: [] }),
    ).toEqual([]);
  });
});
