/**
 * Sync Google Calendar events → calendar_events (+ raw_contacts for new
 * attendee emails).
 *
 * Rebuilt on the Gmail pattern (lib/sync/gmail.ts): a time-budgeted,
 * paginated, incremental sync instead of walking the entire calendar every
 * run. The old version fetched every event with one INSERT per event plus
 * one per attendee — on a large calendar Vercel's 60s function limit killed
 * the process mid-run (before `runImport`'s catch could record the
 * failure), and the rebuild loop kept re-selecting calendar forever because
 * it never finished. See lib/sync/calendar-watermark.ts for the watermark
 * design.
 *
 * Only events with at least one external (non-self) attendee are stored —
 * same filter as before. contactId stays null until the post-merge linking
 * step. selfAttended is true iff the self email is among the attendees.
 *
 * Refs: ROADMAP M2.5
 */
import { google } from "googleapis";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  calendarEvents,
  rawContacts,
  oauthTokens,
  sources,
} from "@/db/schema";
import { clientFromTokens } from "@/lib/google";
import { runImport, type ImportCounters } from "./run";
import {
  computeCalendarWatermarkUpdate,
  type CalendarWatermark,
} from "./calendar-watermark";

// Mirrors gmail.ts's budgeting: keep each run well under Vercel's 60s
// function limit so a big calendar backfills across several passes instead
// of timing out.
const TIME_BUDGET_MS = 12_000;
const PAGE_SIZE = 2500; // Calendar API max page size

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

async function getSelfEmailFromSource(sourceId: string): Promise<string | null> {
  const [src] = await db
    .select({ config: sources.config })
    .from(sources)
    .where(eq(sources.id, sourceId))
    .limit(1);
  const cfg = src?.config as { google_email?: string } | null;
  return cfg?.google_email?.toLowerCase() ?? null;
}

async function getWatermark(sourceId: string): Promise<CalendarWatermark> {
  const [src] = await db
    .select({ config: sources.config })
    .from(sources)
    .where(eq(sources.id, sourceId))
    .limit(1);
  return ((src?.config ?? {}) as CalendarWatermark) ?? {};
}

async function setWatermark(sourceId: string, w: CalendarWatermark) {
  // Merge into existing config (preserves google_email, other keys).
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

export async function syncGoogleCalendar(sourceId: string) {
  return runImport({
    sourceId,
    fn: async (counters: ImportCounters) => {
      const tok = await getTokenForSource(sourceId);
      const auth = clientFromTokens(tok);
      const cal = google.calendar({ version: "v3", auth });
      const selfEmail = await getSelfEmailFromSource(sourceId);
      const watermark = await getWatermark(sourceId);
      const t0 = Date.now();
      const runStartUnix = Math.floor(t0 / 1000);

      const incremental = Boolean(watermark.calendar_backfill_complete);

      // Backfill mode resumes with timeMin at the last processed event's
      // start time (minus a 1s overlap so we don't lose an event whose end
      // time lands exactly on the boundary — timeMin filters on END time,
      // not start; duplicates are harmless, upserts are keyed on
      // externalId). Incremental mode uses updatedMin to pick up
      // new/changed/cancelled events since the last full pass.
      const listParamsBase: {
        calendarId: string;
        maxResults: number;
        singleEvents: boolean;
        orderBy: string;
        showDeleted: boolean;
        timeMin?: string;
        updatedMin?: string;
      } = {
        calendarId: "primary",
        maxResults: PAGE_SIZE,
        singleEvents: true,
        orderBy: "startTime",
        showDeleted: true,
      };
      if (incremental) {
        if (watermark.calendar_updated_since_unix) {
          listParamsBase.updatedMin = new Date(
            watermark.calendar_updated_since_unix * 1000,
          ).toISOString();
        }
      } else if (watermark.calendar_synced_until_unix) {
        listParamsBase.timeMin = new Date(
          watermark.calendar_synced_until_unix * 1000 - 1000,
        ).toISOString();
      }

      let latestStartSeenUnix: number | null = null;
      let bailedEarly = false;
      let reachedEndOfEvents = false;
      let pageToken: string | undefined;

      for (;;) {
        if (Date.now() - t0 > TIME_BUDGET_MS) {
          bailedEarly = true;
          break;
        }

        let res;
        try {
          res = await cal.events.list({ ...listParamsBase, pageToken });
        } catch (err) {
          // Only quota/rate pressure is a soft bail (same as gmail.ts).
          // Anything else — expired token, revoked scope, network — must
          // PROPAGATE so runImport records the failure and
          // classifyFailureStatus can flip the source to needs_reauth;
          // swallowing it would show eternally-"successful" empty syncs.
          const msg = err instanceof Error ? err.message : String(err);
          if (/quota|rate|exceeded|429/i.test(msg)) {
            console.error("calendar events.list quota bail", msg);
            bailedEarly = true;
            break;
          }
          throw err;
        }

        const events = res.data.items ?? [];

        // Collect this page's rows, then batch-upsert: ONE insert for all
        // events and ONE for all attendee-derived raw contacts, instead of a
        // DB round-trip per event and per attendee.
        const eventRows: (typeof calendarEvents.$inferInsert)[] = [];
        const rawByAddr = new Map<string, typeof rawContacts.$inferInsert>();

        for (const ev of events) {
          counters.recordsSeen += 1;
          if (!ev.id) continue;

          const startRaw = ev.start?.dateTime ?? ev.start?.date ?? null;
          if (startRaw) {
            const startUnix = Math.floor(new Date(startRaw).getTime() / 1000);
            latestStartSeenUnix =
              latestStartSeenUnix === null
                ? startUnix
                : Math.max(latestStartSeenUnix, startUnix);
          }

          // Cancelled events surface only via showDeleted/updatedMin; we
          // don't store them (no calendar_events "deleted" concept today —
          // same as before this rewrite).
          if (ev.status === "cancelled") continue;

          // Only keep events that have at least one external attendee.
          const attendees = (ev.attendees ?? [])
            .map((a) => a.email?.toLowerCase())
            .filter((e): e is string => !!e);
          const externals = selfEmail
            ? attendees.filter((e) => e !== selfEmail)
            : attendees;
          if (externals.length === 0) continue;

          const start = ev.start?.dateTime ?? ev.start?.date ?? null;
          const end = ev.end?.dateTime ?? ev.end?.date ?? null;
          if (!start || !end) continue;

          const selfAttended = selfEmail
            ? attendees.includes(selfEmail)
            : false;

          eventRows.push({
            externalId: ev.id,
            title: ev.summary ?? "(no title)",
            startsAt: new Date(start),
            endsAt: new Date(end),
            attendees: externals,
            selfAttended,
          });

          for (const addr of externals) {
            if (!rawByAddr.has(addr)) {
              rawByAddr.set(addr, {
                sourceId,
                externalId: addr,
                payload: { source: "google_calendar", email: addr } as Record<
                  string,
                  unknown
                >,
                emails: [addr],
                phones: [],
                linkedinUrl: null,
                avatarUrl: null,
              });
            }
          }
        }

        // Batch upsert this page's events in one statement.
        if (eventRows.length > 0) {
          const upserted = await db
            .insert(calendarEvents)
            .values(eventRows)
            .onConflictDoUpdate({
              target: calendarEvents.externalId,
              set: {
                title: sql`excluded.title`,
                startsAt: sql`excluded.starts_at`,
                endsAt: sql`excluded.ends_at`,
                attendees: sql`excluded.attendees`,
                selfAttended: sql`excluded.self_attended`,
              },
            })
            .returning({ inserted: sql<boolean>`(xmax = 0)` });
          for (const row of upserted) {
            if (row.inserted) counters.recordsNew += 1;
            else counters.recordsUpdated += 1;
          }
        }
        // Batch upsert all attendee-derived raw contacts for this page.
        if (rawByAddr.size > 0) {
          await db
            .insert(rawContacts)
            .values([...rawByAddr.values()])
            .onConflictDoUpdate({
              target: [rawContacts.sourceId, rawContacts.externalId],
              set: { updatedAt: new Date() },
            });
        }

        pageToken = res.data.nextPageToken ?? undefined;
        if (!pageToken) {
          reachedEndOfEvents = true;
          break;
        }
      }

      const newWatermark = computeCalendarWatermarkUpdate({
        watermark,
        incremental,
        bailedEarly,
        latestStartSeenUnix,
        runStartUnix,
        reachedEndOfEvents,
      });
      await setWatermark(sourceId, newWatermark);
    },
  });
}
