/**
 * Pure watermark-advancement decision for the Google Calendar sync. No DB /
 * server-only deps so it's unit-testable in isolation from
 * `lib/sync/google-calendar.ts`.
 *
 * Mirrors the Gmail watermark pattern (lib/sync/gmail-watermark.ts) but with
 * calendar-appropriate fields, stored in `sources.config`:
 *
 *   - calendar_synced_until_unix: the latest event `start` time (unix
 *     seconds) processed so far during the initial backfill. The next
 *     backfill page resumes with `timeMin` at this point.
 *   - calendar_backfill_complete: true once the backfill has walked forward
 *     through every event up to "now" at least once.
 *   - calendar_updated_since_unix: once backfill is complete, the point
 *     (unix seconds) from which the next incremental pass should query
 *     `updatedMin` — i.e. "give me everything that changed since the last
 *     full incremental pass". Captured as the sync's OWN start time (t0) so
 *     an event updated mid-run is never missed.
 *
 * Backfill walks forward (oldest cursor advances); a bail (time budget) is
 * always safe to persist — next run's `timeMin` simply resumes from
 * wherever we got to, nothing is skipped.
 *
 * Incremental (`updatedMin`) mode: unlike Gmail's newest-first thread
 * listing, `updatedMin` result order is `startTime` (not "most recently
 * updated first"), so a bail partway through does not have Gmail's
 * "unprocessed tail is older" hazard. Still, to keep behavior simple and
 * idempotent-safe, we only advance `calendar_updated_since_unix` to this
 * run's t0 when the pass completes without bailing — an early bail just
 * re-scans the same `updatedMin` window next run (upserts are idempotent).
 */
export type CalendarWatermark = {
  calendar_synced_until_unix?: number;
  calendar_backfill_complete?: boolean;
  calendar_updated_since_unix?: number;
};

export function computeCalendarWatermarkUpdate(args: {
  watermark: CalendarWatermark;
  /** True once backfill is complete; this run used `updatedMin` mode. */
  incremental: boolean;
  bailedEarly: boolean;
  /** Latest event start (unix seconds) seen this run, or null if none. */
  latestStartSeenUnix: number | null;
  /** This run's start time (unix seconds) — becomes the next updatedMin. */
  runStartUnix: number;
  /** True if the backfill page-walk exhausted all pages this run. */
  reachedEndOfEvents: boolean;
}): CalendarWatermark {
  const {
    watermark,
    incremental,
    bailedEarly,
    latestStartSeenUnix,
    runStartUnix,
    reachedEndOfEvents,
  } = args;

  const next: CalendarWatermark = { ...watermark };

  if (!incremental) {
    // Backfill mode: always safe to advance the cursor to whatever we
    // actually processed, bail or not — nothing is skipped, we just resume
    // from here next run.
    if (latestStartSeenUnix !== null) {
      next.calendar_synced_until_unix = Math.max(
        watermark.calendar_synced_until_unix ?? 0,
        latestStartSeenUnix,
      );
    }
    // Backfill is complete once we've walked to the end of the event list
    // without being cut off by the time budget. Flip into incremental mode
    // starting from this run's t0.
    if (!bailedEarly && reachedEndOfEvents) {
      next.calendar_backfill_complete = true;
      next.calendar_updated_since_unix = runStartUnix;
    }
  } else {
    // Incremental mode: only advance updated_since to this run's t0 once the
    // pass completes clean. A bail re-scans the same updatedMin window next
    // run (idempotent, cheap) rather than risk missing something.
    if (!bailedEarly) {
      next.calendar_updated_since_unix = runStartUnix;
    }
  }

  return next;
}
