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
import { sweepUnknownContacts } from "@/lib/contacts/unknown-contacts";
import { sweepBusinessContacts } from "@/lib/contacts/business-contacts";

const GOOGLE_KINDS = ["google_contacts", "gmail", "google_calendar"] as const;

export interface RebuildPass {
  phase: "syncing" | "merging" | "done";
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

  // --- Rebuild phase: backfills are complete. ---
  // Pull new mail incrementally, but at most ONE *productive* Gmail sync per
  // pass: each syncGmail can use its full ~50s budget, so syncing two accounts
  // back-to-back could exceed the 60s function limit. A sync that returned rows
  // means more may remain → stay in the syncing phase and let the button/cron
  // loop call us again. Only when every account reports nothing new do we fall
  // through to the (DB-only, fast) rebuild.
  const newestUnix = (cfg: unknown) =>
    Number((cfg as { newest_synced_unix?: number } | null)?.newest_synced_unix ?? 0);
  const gmailRows = rows
    .filter((r) => r.kind === "gmail" && r.status !== "needs_reauth")
    .sort((a, b) => newestUnix(a.config) - newestUnix(b.config));
  for (const g of gmailRows) {
    let newThreads = 0;
    let seenThreads = 0;
    try {
      const r = await syncGmail(g.id);
      newThreads = r.recordsNew;
      seenThreads = r.recordsSeen;
    } catch (e) {
      console.error("rebuild: incremental gmail failed", g.id, e);
      continue;
    }
    // Gate on *new* threads, not threads seen: Gmail's `after:` has day
    // granularity, so a caught-up account keeps re-returning today's mail
    // (recordsSeen > 0). Gating on that loops on syncing forever and never
    // reaches merge/finalize. recordsNew goes to 0 once caught up.
    if (newThreads > 0) {
      return {
        phase: "syncing",
        done: false,
        detail: `Fetching new mail · ${g.accountEmail || "account"}`,
        syncedThreads: seenThreads,
      };
    }
  }

  await runDedupe(userId);

  // Auto-apply the "safe" set (exact email + high name/phone/linkedin) — the
  // same bucket the /merge page bulk-merges. Apply in a BOUNDED batch per pass:
  // each applyCandidate is several round-trips, so merging a large backlog
  // (hundreds of candidates) in one call exceeds the 60s function limit. If
  // more remain, stay in the merging phase and let the button/cron loop on.
  const MERGE_BATCH = 50;
  const safe = await db
    .select({ id: schema.mergeCandidates.id })
    .from(schema.mergeCandidates)
    .where(
      and(
        eq(schema.mergeCandidates.userId, userId),
        eq(schema.mergeCandidates.status, "pending"),
        inArray(schema.mergeCandidates.confidence, ["exact", "high"]),
      ),
    )
    .limit(MERGE_BATCH);
  let mergeFailures = 0;
  if (safe.length > 0) {
    // Skip the per-merge relink here — the final pass does one global relink.
    const merged = await bulkApply(
      userId,
      safe.map((c) => c.id),
      { relink: false },
    );
    mergeFailures = merged.failed;
    if (merged.failed > 0) {
      console.error(
        `rebuild: ${merged.failed}/${safe.length} safe merges failed`,
        merged.errors.slice(0, 5),
      );
    }
    // Only stay in the merging phase while we're making progress. If EVERY
    // candidate in the batch failed, returning "merging" would re-select the
    // identical batch next pass (runDedupe recreates pending candidates each
    // pass) and the button/cron loop would spin forever. Fall through to
    // finalize instead; the next full rebuild retries them once.
    if (merged.applied > 0) {
      return {
        phase: "merging",
        done: false,
        detail: `Merging duplicates (${merged.applied})`,
      };
    }
  }

  // No safe merges left → finalize: enrich + one global relink.
  const promoted = await enrichAndPromote(userId, { relink: false });
  const relink = await relinkAfterMerge(userId);

  // Sweep no-name "Unknown" contacts that aren't a real relationship. Runs after
  // relink so correspondence counts are accurate; leaves raws linked so they
  // never re-merge into a fresh "Unknown". Keeps the triage queue free of junk.
  const unknownRemoved = await sweepUnknownContacts(userId);
  // Same idea for business / department names (Collections Dept, Accounts
  // Payable, …) — see lib/contacts/business-name.ts.
  const businessRemoved = await sweepBusinessContacts(userId);

  return {
    phase: "done",
    done: true,
    detail: "Rebuild complete",
    stats: {
      contactsCreated: promoted.created,
      contactsEnriched: promoted.attachedToExisting,
      emailThreadsLinked: relink.totals.emailThreads,
      emailsLinked: relink.totals.emails,
      unknownRemoved,
      businessRemoved,
      ...(mergeFailures > 0 ? { mergeFailures } : {}),
    },
  };
}
