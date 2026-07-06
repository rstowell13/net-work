import { describe, it, expect } from "vitest";
import { nextSyncTarget, type SourceState } from "@/lib/rebuild-phase";

const s = (over: Partial<SourceState>): SourceState => ({
  id: over.id ?? "x",
  kind: over.kind ?? "gmail",
  status: over.status ?? "connected",
  backfillComplete: over.backfillComplete ?? false,
  // Use `in` so an explicit `lastSyncAt: null` survives (?? would replace it).
  lastSyncAt: "lastSyncAt" in over ? (over.lastSyncAt ?? null) : new Date(),
});

describe("nextSyncTarget", () => {
  it("returns a Gmail source whose backfill is incomplete", () => {
    const t = nextSyncTarget([
      s({ id: "g", kind: "gmail", backfillComplete: false }),
      s({ id: "c", kind: "google_contacts", lastSyncAt: new Date() }),
    ]);
    expect(t?.id).toBe("g");
  });

  it("returns a never-synced contacts/calendar source once Gmail is complete", () => {
    const t = nextSyncTarget([
      s({ id: "g", kind: "gmail", backfillComplete: true }),
      s({ id: "c", kind: "google_contacts", lastSyncAt: null }),
    ]);
    expect(t?.id).toBe("c");
  });

  it("returns null (→ rebuild) when everything is current", () => {
    const t = nextSyncTarget([
      s({ id: "g", kind: "gmail", backfillComplete: true }),
      s({ id: "c", kind: "google_contacts", lastSyncAt: new Date() }),
      s({
        id: "cal",
        kind: "google_calendar",
        backfillComplete: true,
        lastSyncAt: new Date(),
      }),
    ]);
    expect(t).toBeNull();
  });

  it("keeps selecting a calendar mid-backfill even after it has synced once", () => {
    // Regression: calendar syncs are time-budgeted (12s chunks). A bailed
    // pass stamps lastSyncAt, and the old never-synced-only rule then
    // ignored the source forever — backfill stalled at the oldest chunk.
    const t = nextSyncTarget([
      s({ id: "g", kind: "gmail", backfillComplete: true }),
      s({
        id: "cal",
        kind: "google_calendar",
        backfillComplete: false,
        lastSyncAt: new Date(),
      }),
    ]);
    expect(t?.id).toBe("cal");
  });

  it("skips a dead (needs_reauth) Gmail source so it doesn't block forever", () => {
    const t = nextSyncTarget([
      s({ id: "g", kind: "gmail", status: "needs_reauth", backfillComplete: false }),
      s({ id: "c", kind: "google_contacts", lastSyncAt: new Date() }),
    ]);
    expect(t).toBeNull();
  });

  it("prioritizes Gmail backfill over a never-synced calendar", () => {
    const t = nextSyncTarget([
      s({ id: "cal", kind: "google_calendar", lastSyncAt: null }),
      s({ id: "g", kind: "gmail", backfillComplete: false }),
    ]);
    expect(t?.id).toBe("g");
  });
});
