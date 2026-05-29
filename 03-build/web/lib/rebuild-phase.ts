/**
 * Pure phase-selection for the Sync & rebuild pipeline. Given the user's Google
 * source states, decide the next source to sync — or null, meaning syncing is
 * current and the pass should move to the rebuild (dedupe/merge/enrich/relink)
 * phase. No DB / server-only deps so it's unit-testable.
 */
export interface SourceState {
  id: string;
  kind: string;
  status: string;
  backfillComplete: boolean;
  lastSyncAt: Date | null;
}

export function nextSyncTarget(sources: SourceState[]): SourceState | null {
  // Skip dead-token sources (needs_reauth) so a disconnected account never
  // blocks the loop — the user reconnects it separately.
  const live = sources.filter((s) => s.status !== "needs_reauth");

  // 1. Finish any Gmail backfill first (the long, chunked one).
  const gmail = live.find((s) => s.kind === "gmail" && !s.backfillComplete);
  if (gmail) return gmail;

  // 2. Then any contacts/calendar source that has never synced (one pass each).
  const never = live.find(
    (s) =>
      (s.kind === "google_contacts" || s.kind === "google_calendar") &&
      !s.lastSyncAt,
  );
  if (never) return never;

  // 3. Everything current → caller runs the rebuild phase.
  return null;
}
