/**
 * ImportRun wrapper. Every sync wraps its work in `runImport()` so that
 * we get start/end timestamps, record counts, and error messages stored
 * uniformly in the `import_runs` table — and so that `Source.lastSyncAt`
 * stays current.
 *
 * Refs: ROADMAP M2.7
 */
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import { importRuns, sources } from "@/db/schema";

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

/**
 * Run a sync function inside an ImportRun envelope. The inner function
 * mutates the counters object as it goes; we persist them on completion.
 */
export async function runImport(args: {
  sourceId: string;
  fn: (counters: ImportCounters) => Promise<void>;
}): Promise<ImportResult> {
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
    await db
      .update(sources)
      .set({ lastSyncError: errorMessage, status: "error" })
      .where(eq(sources.id, args.sourceId));
    return {
      ...counters,
      importRunId: run.id,
      status: "failed",
      errorMessage,
    };
  }
}
