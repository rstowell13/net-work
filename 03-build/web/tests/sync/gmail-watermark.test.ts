import { describe, it, expect } from "vitest";
import { computeGmailWatermarkUpdate } from "@/lib/sync/gmail-watermark";

describe("computeGmailWatermarkUpdate", () => {
  it("incremental + bailed early: does NOT advance newest_synced_unix", () => {
    // Gmail lists newest-first in `after:` (incremental) mode. If we bail
    // partway through, the unprocessed tail is OLDER than everything we did
    // process — advancing newest_synced_unix would permanently skip it.
    const result = computeGmailWatermarkUpdate({
      watermark: {
        backfill_complete: true,
        newest_synced_unix: 1000,
        oldest_synced_unix: 500,
      },
      incremental: true,
      bailedEarly: true,
      oldestSeenUnix: 500,
      newestSeenUnix: 1500, // would have advanced past 1000 if allowed
      threadIdsLength: 200,
      maxThreadsPerRun: 200,
    });
    expect(result.newest_synced_unix).toBe(1000); // unchanged
    expect(result.backfill_complete).toBe(true);
  });

  it("backfill + bailed early: still advances the oldest cursor", () => {
    // Backfill walks strictly older (`before:`); a bail is safe to persist
    // because nothing between the old and new cursor is skipped — the next
    // run's `before:` just continues from there.
    const result = computeGmailWatermarkUpdate({
      watermark: { oldest_synced_unix: 2000 },
      incremental: false,
      bailedEarly: true,
      oldestSeenUnix: 1200,
      newestSeenUnix: 1900,
      threadIdsLength: 200,
      maxThreadsPerRun: 200,
    });
    expect(result.oldest_synced_unix).toBe(1200);
    // Not incremental, so newest_synced_unix is still allowed to advance.
    expect(result.newest_synced_unix).toBe(1900);
    // Bailed, so backfill isn't marked complete even though we didn't hit
    // the cap check in this scenario (threadIdsLength === maxThreadsPerRun).
    expect(result.backfill_complete).toBeUndefined();
  });

  it("clean run (no bail): advances both bounds", () => {
    const result = computeGmailWatermarkUpdate({
      watermark: { oldest_synced_unix: 2000, newest_synced_unix: 2500 },
      incremental: false,
      bailedEarly: false,
      oldestSeenUnix: 1000,
      newestSeenUnix: 2600,
      threadIdsLength: 50,
      maxThreadsPerRun: 200,
    });
    expect(result.oldest_synced_unix).toBe(1000);
    expect(result.newest_synced_unix).toBe(2600);
    // Fewer threads than the cap and no bail → we've reached the horizon.
    expect(result.backfill_complete).toBe(true);
  });

  it("clean incremental run: advances newest_synced_unix", () => {
    const result = computeGmailWatermarkUpdate({
      watermark: { backfill_complete: true, newest_synced_unix: 1000 },
      incremental: true,
      bailedEarly: false,
      oldestSeenUnix: null,
      newestSeenUnix: 1500,
      threadIdsLength: 10,
      maxThreadsPerRun: 200,
    });
    expect(result.newest_synced_unix).toBe(1500);
    expect(result.backfill_complete).toBe(true);
  });

  it("does not flip backfill_complete when the thread cap was hit, even without a bail", () => {
    const result = computeGmailWatermarkUpdate({
      watermark: {},
      incremental: false,
      bailedEarly: false,
      oldestSeenUnix: 100,
      newestSeenUnix: 200,
      threadIdsLength: 200,
      maxThreadsPerRun: 200,
    });
    expect(result.backfill_complete).toBeUndefined();
  });

  it("never regresses oldest/newest bounds when this run saw nothing", () => {
    const result = computeGmailWatermarkUpdate({
      watermark: { oldest_synced_unix: 500, newest_synced_unix: 900 },
      incremental: false,
      bailedEarly: false,
      oldestSeenUnix: null,
      newestSeenUnix: null,
      threadIdsLength: 0,
      maxThreadsPerRun: 200,
    });
    expect(result.oldest_synced_unix).toBe(500);
    expect(result.newest_synced_unix).toBe(900);
    expect(result.backfill_complete).toBe(true);
  });
});
