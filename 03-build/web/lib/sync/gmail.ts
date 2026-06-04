/**
 * Sync Gmail thread metadata → emails + email_threads (+ raw_contacts for
 * any new addresses).
 *
 * Strategy: list threads from the last 2 years, fetch each thread's
 * messages with `format=metadata` so we get headers without the body
 * payload (cheap), plus a 2KB body preview from `messages.get` snippet
 * field. Group emails into existing email_threads keyed by Gmail's
 * thread ID. raw_contacts.contactId stays null until M4 merge.
 *
 * Refs: ROADMAP M2.4
 */
import { google } from "googleapis";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  rawContacts,
  oauthTokens,
  emails,
  emailThreads,
  sources,
} from "@/db/schema";
import { clientFromTokens } from "@/lib/google";
import { runImport, type ImportCounters } from "./run";
import { parseAddressEntries } from "./parse-addresses";

// Each Sync now run pulls up to MAX_THREADS_PER_RUN older threads (or
// brand-new ones since the last sync). This keeps every run under
// Vercel's 60s function timeout. Subsequent clicks back-fill further.
//
// We bookmark progress in source.config:
//   - oldest_synced_unix: oldest internalDate seen so far (seconds).
//     Next backfill run uses `before:` to fetch older threads.
//   - newest_synced_unix: newest internalDate seen so far (seconds).
//     Future runs can use `after:` to pick up incremental new mail.
const MAX_THREADS_PER_RUN = 200;
const FETCH_CONCURRENCY = 5;
const TIME_BUDGET_MS = 12_000; // one chunk well under the 60s function limit

// Gmail's per-user-per-minute quota is ~250 quota units; threads.get costs 5
// each. We back off gracefully on 429s instead of treating them as failures.
function isQuotaError(err: unknown): boolean {
  const msg =
    err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return /quota|rate|exceeded|429/i.test(msg);
}
const HEADERS_TO_KEEP = ["From", "To", "Cc", "Subject", "Date", "Message-ID"];

type GmailWatermark = {
  oldest_synced_unix?: number;
  newest_synced_unix?: number;
  /** Set true once we've walked all the way back to the 2-year horizon. */
  backfill_complete?: boolean;
};

// Pulls the user's own gmail address from the source.config.google_email,
// used to classify each email as inbound or outbound.
async function getSelfEmailFromSource(sourceId: string): Promise<string | null> {
  const [src] = await db
    .select({ config: sources.config })
    .from(sources)
    .where(eq(sources.id, sourceId))
    .limit(1);
  if (!src?.config) return null;
  const cfg = src.config as { google_email?: string };
  return cfg.google_email?.toLowerCase() ?? null;
}

async function getTokenForSource(sourceId: string) {
  const [token] = await db
    .select()
    .from(oauthTokens)
    .where(eq(oauthTokens.sourceId, sourceId))
    .limit(1);
  if (!token) throw new Error(`No OAuth token for source ${sourceId}`);
  return {
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    expiresAt: token.expiresAt,
    scopes: token.scopes,
  };
}

/**
 * Get the gmail-source-id for a user's gmail source. Used so the manual
 * sync endpoint doesn't have to re-do the lookup.
 */
export async function getGmailSourceForUser(userId: string) {
  const allRows = await db.select().from(sources).where(eq(sources.userId, userId));
  return allRows.find((s) => s.kind === "gmail") ?? null;
}

// ============================================================
// Sync
// ============================================================

export async function syncGmail(sourceId: string) {
  return runImport({
    sourceId,
    fn: async (counters: ImportCounters) => {
      const tok = await getTokenForSource(sourceId);
      const auth = clientFromTokens(tok);
      const gmail = google.gmail({ version: "v1", auth });
      const selfEmail = await getSelfEmailFromSource(sourceId);
      const watermark = await getWatermark(sourceId);
      const t0 = Date.now();
      let oldestSeenUnix: number | null = null;
      let newestSeenUnix: number | null = null;

      // All-time backfill — no time floor. Strategy:
      //  - First-time run (no watermark): no q filter (oldest first via paging).
      //  - Backfill not complete: walk older — `before:<oldest_synced>`.
      //  - Backfill complete: incremental — `after:<newest_synced>`.
      let q: string;
      if (watermark.backfill_complete && watermark.newest_synced_unix) {
        q = `after:${watermark.newest_synced_unix}`;
      } else if (watermark.oldest_synced_unix) {
        q = `before:${watermark.oldest_synced_unix}`;
      } else {
        q = ""; // no filter on first run
      }

      // Step 1 — list threads matching q, capped at MAX_THREADS_PER_RUN
      const threadIds: string[] = [];
      let pageToken: string | undefined;
      let quotaTripped = false;
      while (threadIds.length < MAX_THREADS_PER_RUN) {
        const listParams: {
          userId: string;
          maxResults: number;
          pageToken?: string;
          q?: string;
        } = {
          userId: "me",
          maxResults: Math.min(500, MAX_THREADS_PER_RUN - threadIds.length),
          pageToken,
        };
        if (q) listParams.q = q;
        try {
          const res = await gmail.users.threads.list(listParams);
          const ids = (res.data.threads ?? []).map((t) => t.id!).filter(Boolean);
          threadIds.push(...ids);
          pageToken = res.data.nextPageToken ?? undefined;
          if (!pageToken) break;
        } catch (err) {
          if (isQuotaError(err)) {
            quotaTripped = true;
            break;
          }
          throw err; // anything else is a real failure
        }
      }

      // If we got nothing AND we were doing a backfill, mark it complete.
      if (threadIds.length === 0 && !watermark.backfill_complete) {
        await setWatermark(sourceId, { ...watermark, backfill_complete: true });
        return;
      }

      // Step 2 — fetch threads in parallel batches.
      let bailedEarly = quotaTripped;
      for (let i = 0; i < threadIds.length; i += FETCH_CONCURRENCY) {
        if (bailedEarly) break;
        if (Date.now() - t0 > TIME_BUDGET_MS) {
          bailedEarly = true;
          break;
        }
        const batch = threadIds.slice(i, i + FETCH_CONCURRENCY);
        const fetched = await Promise.all(
          batch.map((tid) =>
            gmail.users.threads
              .get({
                userId: "me",
                id: tid,
                format: "metadata",
                metadataHeaders: HEADERS_TO_KEEP,
              })
              .then((r) => ({ tid, t: r }))
              .catch((e) => {
                if (isQuotaError(e)) {
                  bailedEarly = true; // signal outer loop to stop
                  return null;
                }
                console.error("gmail thread fetch error", tid, e);
                return null;
              }),
          ),
        );
        for (const entry of fetched) {
          if (!entry) continue;
          const { tid, t } = entry;
          counters.recordsSeen += 1;
          try {
          const msgs = t.data.messages ?? [];
          if (msgs.length === 0) continue;

          // Compute thread-level fields
          const sentTimes = msgs
            .map((m) => parseInt(m.internalDate ?? "0", 10))
            .filter((n) => n > 0);
          if (sentTimes.length === 0) continue;
          const startedAt = new Date(Math.min(...sentTimes));
          const endedAt = new Date(Math.max(...sentTimes));

          // Track watermarks (in unix seconds)
          const oldestMsUnix = Math.floor(Math.min(...sentTimes) / 1000);
          const newestMsUnix = Math.floor(Math.max(...sentTimes) / 1000);
          oldestSeenUnix = oldestSeenUnix === null ? oldestMsUnix : Math.min(oldestSeenUnix, oldestMsUnix);
          newestSeenUnix = newestSeenUnix === null ? newestMsUnix : Math.max(newestSeenUnix, newestMsUnix);

          // Upsert the thread
          const threadRows = await db
            .insert(emailThreads)
            .values({
              externalThreadId: tid,
              startedAt,
              endedAt,
              messageCount: msgs.length,
            })
            .onConflictDoUpdate({
              target: emailThreads.externalThreadId,
              set: {
                startedAt,
                endedAt,
                messageCount: msgs.length,
                updatedAt: new Date(),
              },
            })
            .returning({
              id: emailThreads.id,
              createdAt: emailThreads.createdAt,
            });
          const thread = threadRows[0];

          if (
            thread.createdAt &&
            Date.now() - thread.createdAt.getTime() < 5_000
          ) {
            counters.recordsNew += 1;
          } else {
            counters.recordsUpdated += 1;
          }

          // Collect this thread's rows, then batch-upsert: ONE insert for all
          // emails and ONE for all gmail-derived contacts, instead of a DB
          // round-trip per message and per address. A long thread (hundreds of
          // messages) otherwise meant thousands of sequential writes that could
          // blow the serverless time limit.
          const emailRows: (typeof emails.$inferInsert)[] = [];
          const rawByAddr = new Map<string, typeof rawContacts.$inferInsert>();
          for (const m of msgs) {
            const headers = (m.payload?.headers ?? []) as {
              name?: string | null;
              value?: string | null;
            }[];
            const h = (name: string) =>
              headers.find((x) => x.name?.toLowerCase() === name.toLowerCase())
                ?.value ?? "";

            const fromRaw = h("from");
            const toRaw = h("to");
            const ccRaw = h("cc");
            const subject = h("subject");
            const sentAt = m.internalDate
              ? new Date(parseInt(m.internalDate, 10))
              : new Date();

            // Parse with display names so we can name gmail-derived contacts.
            const fromEntries = parseAddressEntries(fromRaw);
            const toEntries = parseAddressEntries(toRaw);
            const ccEntries = parseAddressEntries(ccRaw);
            const fromEmail = fromEntries[0]?.email ?? null;
            const toEmails = toEntries.map((e) => e.email);
            const ccEmails = ccEntries.map((e) => e.email);
            // address -> display name (first real name wins).
            const nameByAddr = new Map<string, string>();
            for (const e of [...fromEntries, ...toEntries, ...ccEntries]) {
              if (e.name && !nameByAddr.has(e.email)) nameByAddr.set(e.email, e.name);
            }

            const direction =
              selfEmail && fromEmail === selfEmail ? "outbound" : "inbound";

            // Persist a 2KB body preview (Gmail's "snippet" field is small)
            const bodyPreview = (m.snippet ?? "").slice(0, 2048);

            emailRows.push({
              threadId: thread.id,
              externalId: m.id!,
              direction,
              sentAt,
              subject,
              body: bodyPreview,
              fromEmail,
              toEmails,
              ccEmails,
            });

            const seenAddrs = [fromEmail, ...toEmails, ...ccEmails].filter(
              (e): e is string => !!e && e !== selfEmail,
            );
            for (const addr of seenAddrs) {
              const addrName = nameByAddr.get(addr) ?? null;
              const existing = rawByAddr.get(addr);
              if (!existing) {
                rawByAddr.set(addr, {
                  sourceId,
                  externalId: addr, // email is the external id for gmail-derived raw contacts
                  payload: { source: "gmail", email: addr, name: addrName } as Record<
                    string,
                    unknown
                  >,
                  name: addrName,
                  emails: [addr],
                  phones: [],
                  linkedinUrl: null,
                  avatarUrl: null,
                });
              } else if (!existing.name && addrName) {
                existing.name = addrName;
                existing.payload = { source: "gmail", email: addr, name: addrName };
              }
            }
          }

          // Batch upsert all of this thread's emails in one statement.
          if (emailRows.length > 0) {
            await db
              .insert(emails)
              .values(emailRows)
              .onConflictDoUpdate({
                target: emails.externalId,
                set: {
                  threadId: sql`excluded.thread_id`,
                  direction: sql`excluded.direction`,
                  sentAt: sql`excluded.sent_at`,
                  subject: sql`excluded.subject`,
                  body: sql`excluded.body`,
                  fromEmail: sql`excluded.from_email`,
                  toEmails: sql`excluded.to_emails`,
                  ccEmails: sql`excluded.cc_emails`,
                },
              });
          }
          // Batch upsert all gmail-derived contacts; keep an existing name.
          if (rawByAddr.size > 0) {
            await db
              .insert(rawContacts)
              .values([...rawByAddr.values()])
              .onConflictDoUpdate({
                target: [rawContacts.sourceId, rawContacts.externalId],
                set: {
                  name: sql`coalesce(${rawContacts.name}, excluded.name)`,
                  updatedAt: new Date(),
                },
              });
          }
          } catch (e) {
            // Don't fail the whole sync on one bad thread.
            console.error("gmail thread sync error", tid, e);
          }
        } // end inner for (const entry of fetched)
      } // end outer for (concurrency batches)

      // Persist watermark for the next run.
      const newWatermark: GmailWatermark = { ...watermark };
      if (oldestSeenUnix !== null) {
        newWatermark.oldest_synced_unix = Math.min(
          watermark.oldest_synced_unix ?? Number.POSITIVE_INFINITY,
          oldestSeenUnix,
        );
      }
      if (newestSeenUnix !== null) {
        newWatermark.newest_synced_unix = Math.max(
          watermark.newest_synced_unix ?? 0,
          newestSeenUnix,
        );
      }
      // If we got fewer threads than the cap AND we weren't bailed by the
      // time budget, we've reached the 2-year horizon.
      if (
        !bailedEarly &&
        threadIds.length < MAX_THREADS_PER_RUN &&
        !watermark.backfill_complete
      ) {
        newWatermark.backfill_complete = true;
      }
      await setWatermark(sourceId, newWatermark);
    },
  });
}

async function getWatermark(sourceId: string): Promise<GmailWatermark> {
  const [src] = await db
    .select({ config: sources.config })
    .from(sources)
    .where(eq(sources.id, sourceId))
    .limit(1);
  return ((src?.config ?? {}) as GmailWatermark) ?? {};
}

async function setWatermark(sourceId: string, w: GmailWatermark) {
  // Merge into existing config (preserves google_email)
  const [src] = await db
    .select({ config: sources.config })
    .from(sources)
    .where(eq(sources.id, sourceId))
    .limit(1);
  const merged = { ...(src?.config ?? {}), ...w };
  await db
    .update(sources)
    .set({ config: merged, updatedAt: new Date() })
    .where(eq(sources.id, sourceId));
}
