import { describe, it, expect } from "vitest";
import { computeCalendarWatermarkUpdate } from "@/lib/sync/calendar-watermark";

describe("computeCalendarWatermarkUpdate", () => {
  it("backfill + bailed early: still advances the synced-until cursor", () => {
    // Backfill walks forward in time (oldest -> newest); a bail is safe to
    // persist because timeMin just resumes from wherever we got to. Nothing
    // between old and new cursor is skipped.
    const result = computeCalendarWatermarkUpdate({
      watermark: { calendar_synced_until_unix: 100 },
      incremental: false,
      bailedEarly: true,
      latestStartSeenUnix: 500,
      runStartUnix: 9999,
      reachedEndOfEvents: false,
    });
    expect(result.calendar_synced_until_unix).toBe(500);
    expect(result.calendar_backfill_complete).toBeUndefined();
  });

  it("backfill reaches the end without bailing: flips to incremental mode", () => {
    const result = computeCalendarWatermarkUpdate({
      watermark: { calendar_synced_until_unix: 100 },
      incremental: false,
      bailedEarly: false,
      latestStartSeenUnix: 800,
      runStartUnix: 9999,
      reachedEndOfEvents: true,
    });
    expect(result.calendar_synced_until_unix).toBe(800);
    expect(result.calendar_backfill_complete).toBe(true);
    // Incremental phase starts from this run's own start time so an event
    // updated mid-run is never missed.
    expect(result.calendar_updated_since_unix).toBe(9999);
  });

  it("backfill reaches the end but bailed anyway: does not flip to incremental", () => {
    // reachedEndOfEvents and bailedEarly are mutually exclusive in the real
    // loop, but the pure function should still treat bailedEarly as
    // authoritative (defensive).
    const result = computeCalendarWatermarkUpdate({
      watermark: {},
      incremental: false,
      bailedEarly: true,
      latestStartSeenUnix: 800,
      runStartUnix: 9999,
      reachedEndOfEvents: true,
    });
    expect(result.calendar_backfill_complete).toBeUndefined();
  });

  it("incremental + bailed early: does NOT advance calendar_updated_since_unix", () => {
    const result = computeCalendarWatermarkUpdate({
      watermark: {
        calendar_backfill_complete: true,
        calendar_updated_since_unix: 1000,
      },
      incremental: true,
      bailedEarly: true,
      latestStartSeenUnix: 1500,
      runStartUnix: 2000,
      reachedEndOfEvents: false,
    });
    expect(result.calendar_updated_since_unix).toBe(1000); // unchanged
    expect(result.calendar_backfill_complete).toBe(true);
  });

  it("incremental clean run: advances calendar_updated_since_unix to this run's start", () => {
    const result = computeCalendarWatermarkUpdate({
      watermark: {
        calendar_backfill_complete: true,
        calendar_updated_since_unix: 1000,
      },
      incremental: true,
      bailedEarly: false,
      latestStartSeenUnix: 1800,
      runStartUnix: 2000,
      reachedEndOfEvents: true,
    });
    expect(result.calendar_updated_since_unix).toBe(2000);
  });

  it("never regresses the synced-until cursor when nothing was seen", () => {
    const result = computeCalendarWatermarkUpdate({
      watermark: { calendar_synced_until_unix: 500 },
      incremental: false,
      bailedEarly: false,
      latestStartSeenUnix: null,
      runStartUnix: 9999,
      reachedEndOfEvents: true,
    });
    expect(result.calendar_synced_until_unix).toBe(500);
    expect(result.calendar_backfill_complete).toBe(true);
  });
});
