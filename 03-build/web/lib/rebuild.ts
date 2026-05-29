/**
 * One bounded pass of the Sync & rebuild pipeline. The caller (button loop or
 * nightly cron) re-invokes until `done`. Each pass either advances syncing by
 * one chunk, or — once all Google sources are current — runs the full rebuild
 * (dedupe → auto-merge safe → enrich/promote → relink).
 *
 * Kept under Vercel's 60s budget: a "syncing" pass does at most one chunk
 * (syncGmail self-bounds to ~50s); the "rebuild" pass is cheap in steady state
 * because relink/enrich only touch still-dangling rows.
 */
import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { nextSyncTarget, type SourceState } from "@/lib/rebuild-phase";
import { syncGmail } from "@/lib/sync/gmail";
import { syncGoogleContacts } from "@/lib/sync/google-contacts";
import { syncGoogleCalendar } from "@/lib/sync/google-calendar";
import { runDedupe } from "@/lib/merge/dedupe";
import { bulkApply } from "@/lib/merge/apply";
import { enrichAndPromote } from "@/lib/merge/promote";
import { relinkAfterMerge } from "@/lib/relink";

const GOOGLE_KINDS = ["google_contacts", "gmail", "google_calendar"] as const;

export interface RebuildPass {
  phase: "syncing" | "done";
  done: boolean;
  detail: string;
  syncedThreads?: number;
  stats?: Record<string, unknown>;
}

async function loadGoogleSources(userId: string) {
  return db
    .select({
      id: schema.sources.id,
      kind: schema.sources.kind,
      status: schema.sources.status,
      lastSyncAt: schema.sources.lastSyncAt,
      config: schema.sources.config,
      accountEmail: schema.sources.accountEmail,
    })
    .from(schema.sources)
    .where(
      and(
        eq(schema.sources.userId, userId),
        inArray(schema.sources.kind, [...GOOGLE_KINDS]),
      ),
    );
}

export async function runRebuildPass(userId: string): Promise<RebuildPass> {
  const rows = await loadGoogleSources(userId);
  const states: SourceState[] = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    status: r.status,
    backfillComplete:
      (r.config as { backfill_complete?: boolean } | null)
        ?.backfill_complete === true,
    lastSyncAt: r.lastSyncAt,
  }));

  // --- Syncing phase: advance one source by one chunk. ---
  const target = nextSyncTarget(states);
  if (target) {
    const row = rows.find((r) => r.id === target.id)!;
    const label = row.accountEmail || "account";
    if (target.kind === "gmail") {
      const r = await syncGmail(target.id);
      return {
        phase: "syncing",
        done: false,
        detail: `Syncing Gmail · ${label}`,
        syncedThreads: r.recordsSeen,
      };
    }
    if (target.kind === "google_contacts") {
      const r = await syncGoogleContacts(target.id);
      return {
        phase: "syncing",
        done: false,
        detail: `Syncing Contacts · ${label}`,
        syncedThreads: r.recordsSeen,
      };
    }
    const r = await syncGoogleCalendar(target.id);
    return {
      phase: "syncing",
      done: false,
      detail: `Syncing Calendar · ${label}`,
      syncedThreads: r.recordsSeen,
    };
  }

  // --- Rebuild phase: syncs are current. ---
  // Pull any *new* mail incrementally from each live Gmail source (cheap once
  // caught up — uses after:<newest>), then rebuild the contact graph.
  for (const r of rows) {
    if (r.kind === "gmail" && r.status !== "needs_reauth") {
      try {
        await syncGmail(r.id);
      } catch (e) {
        console.error("rebuild: incremental gmail failed", r.id, e);
      }
    }
  }

  const dedupe = await runDedupe(userId);

  // Auto-apply the "safe" set (exact email + high name/phone/linkedin) — the
  // same bucket the /merge page bulk-merges. Ambiguous stay for manual review.
  const safe = await db
    .select({ id: schema.mergeCandidates.id })
    .from(schema.mergeCandidates)
    .where(
      and(
        eq(schema.mergeCandidates.userId, userId),
        eq(schema.mergeCandidates.status, "pending"),
        inArray(schema.mergeCandidates.confidence, ["exact", "high"]),
      ),
    );
  const merged = await bulkApply(
    userId,
    safe.map((c) => c.id),
  );

  const promoted = await enrichAndPromote(userId);
  const relink = await relinkAfterMerge(userId);

  return {
    phase: "done",
    done: true,
    detail: "Rebuild complete",
    stats: {
      candidatesCreated: dedupe.candidatesCreated,
      merged: merged.applied,
      contactsCreated: promoted.created,
      contactsEnriched: promoted.attachedToExisting,
      emailThreadsLinked: relink.totals.emailThreads,
      emailsLinked: relink.totals.emails,
    },
  };
}
