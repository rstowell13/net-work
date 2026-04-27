/**
 * Sync Google Calendar events → calendar_events (+ raw_contacts for new
 * attendee emails).
 *
 * Pulls events from the last 2 years from the user's primary calendar.
 * contactId is null until the post-merge linking step.
 *
 * Refs: ROADMAP M2.5
 */
import { google } from "googleapis";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  calendarEvents,
  rawContacts,
  oauthTokens,
  sources,
} from "@/db/schema";
import { clientFromTokens } from "@/lib/google";
import { runImport, type ImportCounters } from "./run";

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

export async function syncGoogleCalendar(sourceId: string) {
  return runImport({
    sourceId,
    fn: async (counters: ImportCounters) => {
      const tok = await getTokenForSource(sourceId);
      const auth = clientFromTokens(tok);
      const cal = google.calendar({ version: "v3", auth });
      const selfEmail = await getSelfEmailFromSource(sourceId);

      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

      let pageToken: string | undefined;
      do {
        const res = await cal.events.list({
          calendarId: "primary",
          timeMin: twoYearsAgo.toISOString(),
          maxResults: 2500,
          singleEvents: true,
          orderBy: "startTime",
          pageToken,
        });
        const events = res.data.items ?? [];
        for (const ev of events) {
          counters.recordsSeen += 1;
          if (!ev.id) continue;

          // Only keep events that have at least one external attendee
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

          await db
            .insert(calendarEvents)
            .values({
              externalId: ev.id,
              title: ev.summary ?? "(no title)",
              startsAt: new Date(start),
              endsAt: new Date(end),
              attendees: externals,
              selfAttended,
            })
            .onConflictDoUpdate({
              target: calendarEvents.externalId,
              set: {
                title: ev.summary ?? "(no title)",
                startsAt: new Date(start),
                endsAt: new Date(end),
                attendees: externals,
                selfAttended,
              },
            });

          counters.recordsNew += 1; // approximate; not worth a roundtrip

          // Create RawContact rows for new attendee emails
          for (const addr of externals) {
            await db
              .insert(rawContacts)
              .values({
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
              })
              .onConflictDoNothing();
          }
        }
        pageToken = res.data.nextPageToken ?? undefined;
      } while (pageToken);
    },
  });
}
