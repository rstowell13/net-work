/**
 * Pure watermark-advancement decision for the Gmail sync. No DB / server-only
 * deps so it's unit-testable in isolation from `lib/sync/gmail.ts`.
 *
 * Gmail's `threads.list` returns newest-first. In incremental mode (`after:`,
 * once backfill_complete) that means: if we bail early (time budget or quota)
 * partway through the listed threads, the UNPROCESSED tail is OLDER than
 * everything we did process. Advancing `newest_synced_unix` to the max
 * processed date would make the next run's `after:` skip that older,
 * unprocessed tail forever. So on an incremental bail, we must NOT advance
 * newest_synced_unix at all — upserts are idempotent and re-listing the same
 * threads next run is cheap.
 *
 * In backfill mode (`before:`, walking older threads oldest-direction) a bail
 * is safe to persist: we always advance the oldest bound to whatever we
 * actually processed, and next run's `before:` continues from there. Nothing
 * is skipped — we just pick up the remainder next pass.
 */
export type GmailWatermark = {
  oldest_synced_unix?: number;
  newest_synced_unix?: number;
  /** Set true once we've walked all the way back to the 2-year horizon. */
  backfill_complete?: boolean;
};

export function computeGmailWatermarkUpdate(args: {
  watermark: GmailWatermark;
  /** True once backfill has reached the horizon; incremental (`after:`) mode. */
  incremental: boolean;
  bailedEarly: boolean;
  oldestSeenUnix: number | null;
  newestSeenUnix: number | null;
  threadIdsLength: number;
  maxThreadsPerRun: number;
}): GmailWatermark {
  const {
    watermark,
    incremental,
    bailedEarly,
    oldestSeenUnix,
    newestSeenUnix,
    threadIdsLength,
    maxThreadsPerRun,
  } = args;

  const newWatermark: GmailWatermark = { ...watermark };

  if (oldestSeenUnix !== null) {
    newWatermark.oldest_synced_unix = Math.min(
      watermark.oldest_synced_unix ?? Number.POSITIVE_INFINITY,
      oldestSeenUnix,
    );
  }

  // Incremental + bailed early: do NOT advance newest_synced_unix. The
  // unprocessed (older) tail must be revisited next run, not skipped.
  const skipNewestAdvance = incremental && bailedEarly;
  if (newestSeenUnix !== null && !skipNewestAdvance) {
    newWatermark.newest_synced_unix = Math.max(
      watermark.newest_synced_unix ?? 0,
      newestSeenUnix,
    );
  }

  // If we got fewer threads than the cap AND we weren't bailed by the time
  // budget/quota, we've reached the 2-year horizon.
  if (
    !bailedEarly &&
    threadIdsLength < maxThreadsPerRun &&
    !watermark.backfill_complete
  ) {
    newWatermark.backfill_complete = true;
  }

  return newWatermark;
}
