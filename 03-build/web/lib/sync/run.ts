/**
 * ImportRun wrapper. Every sync wraps its work in `runImport()` so that
 * we get start/end timestamps, record counts, and error messages stored
 * uniformly in the `import_runs` table — and so that `Source.lastSyncAt`
 * stays current.
 *
 * Refs: ROADMAP M2.7
 */
import { db } from "@/lib/db";
import { and, eq, lt } from "drizzle-orm";
import { importRuns, sources } from "@/db/schema";
import { classifyFailureStatus } from "./auth-error";

export type ImportCounters = {
  recordsSeen: number;
  recordsNew: number;
  recordsUpdated: number;
};

export type ImportResult = ImportCounters & {
  importRunId: string;
  status: "success" | "partial" | "failed";
  errorMessage?: string;
};

// A Vercel timeout/OOM kills the process mid-run, leaving the import_runs
// row stuck "running" forever with sources.lastSyncError never set (so the
// Sources UI never shows the failure). Any run still "running" after this
// long is dead — sweep it to "failed" before starting a new one.
const STALE_RUN_THRESHOLD_MS = 5 * 60 * 1000;

async function sweepStaleRuns(sourceId: string): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_RUN_THRESHOLD_MS);
  const stale = await db
    .update(importRuns)
    .set({
      status: "failed",
      finishedAt: new Date(),
      errorMessage: "interrupted",
    })
    .where(
      and(
        eq(importRuns.sourceId, sourceId),
        eq(importRuns.status, "running"),
        lt(importRuns.startedAt, cutoff),
      ),
    )
    .returning({ id: importRuns.id });
  if (stale.length > 0) {
    await db
      .update(sources)
      .set({ lastSyncError: "interrupted", status: "error" })
      .where(eq(sources.id, sourceId));
  }
}

/**
 * Run a sync function inside an ImportRun envelope. The inner function
 * mutates the counters object as it goes; we persist them on completion.
 */
export async function runImport(args: {
  sourceId: string;
  fn: (counters: ImportCounters) => Promise<void>;
}): Promise<ImportResult> {
  await sweepStaleRuns(args.sourceId);

  const counters: ImportCounters = {
    recordsSeen: 0,
    recordsNew: 0,
    recordsUpdated: 0,
  };

  const [run] = await db
    .insert(importRuns)
    .values({
      sourceId: args.sourceId,
      status: "running",
    })
    .returning({ id: importRuns.id });

  try {
    await args.fn(counters);
    await db
      .update(importRuns)
      .set({
        finishedAt: new Date(),
        status: "success",
        recordsSeen: counters.recordsSeen,
        recordsNew: counters.recordsNew,
        recordsUpdated: counters.recordsUpdated,
      })
      .where(eq(importRuns.id, run.id));
    await db
      .update(sources)
      .set({ lastSyncAt: new Date(), lastSyncError: null, status: "connected" })
      .where(eq(sources.id, args.sourceId));
    return { ...counters, importRunId: run.id, status: "success" };
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : String(err ?? "unknown error");
    await db
      .update(importRuns)
      .set({
        finishedAt: new Date(),
        status: "failed",
        recordsSeen: counters.recordsSeen,
        recordsNew: counters.recordsNew,
        recordsUpdated: counters.recordsUpdated,
        errorMessage,
      })
      .where(eq(importRuns.id, run.id));
    // An expired/revoked OAuth token must surface as needs_reauth (so the
    // Sources UI offers a Reconnect button), not a generic error (which only
    // offers "Sync now" — useless when the login itself is dead).
    await db
      .update(sources)
      .set({
        lastSyncError: errorMessage,
        status: classifyFailureStatus(errorMessage),
      })
      .where(eq(sources.id, args.sourceId));
    return {
      ...counters,
      importRunId: run.id,
      status: "failed",
      errorMessage,
    };
  }
}
