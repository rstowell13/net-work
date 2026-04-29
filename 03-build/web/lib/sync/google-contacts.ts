/**
 * Sync Google Contacts → raw_contacts rows.
 *
 * Uses People API connections.list with pagination. One pass = all contacts.
 * Idempotent: each row is upserted on (source_id, external_id).
 *
 * Refs: ROADMAP M2.3
 */
import { google } from "googleapis";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { rawContacts, oauthTokens, sources } from "@/db/schema";
import { clientFromTokens } from "@/lib/google";
import { runImport, type ImportCounters } from "./run";

const PERSON_FIELDS = [
  "names",
  "emailAddresses",
  "phoneNumbers",
  "photos",
  "urls",
  "organizations",
  "biographies",
  "metadata",
].join(",");

export async function syncGoogleContacts(sourceId: string) {
  return runImport({
    sourceId,
    fn: async (counters: ImportCounters) => {
      const tok = await getTokenForSource(sourceId);
      const auth = clientFromTokens(tok);
      const people = google.people({ version: "v1", auth });

      let pageToken: string | undefined;
      do {
        const res = await people.people.connections.list({
          resourceName: "people/me",
          pageSize: 1000,
          personFields: PERSON_FIELDS,
          pageToken,
        });

        const conns = res.data.connections ?? [];
        for (const p of conns) {
          counters.recordsSeen += 1;

          // Pull out the bits we care about
          const externalId = p.resourceName ?? null;
          if (!externalId) continue;

          const name =
            p.names?.find((n) => n.metadata?.primary)?.displayName ??
            p.names?.[0]?.displayName ??
            null;

          const emails =
            p.emailAddresses
              ?.map((e) => e.value?.toLowerCase().trim())
              .filter((v): v is string => !!v) ?? [];

          const phones =
            p.phoneNumbers
              ?.map((ph) => ph.canonicalForm ?? ph.value)
              .filter((v): v is string => !!v) ?? [];

          const linkedinUrl =
            p.urls?.find((u) =>
              (u.value ?? "").toLowerCase().includes("linkedin.com"),
            )?.value ?? null;

          // Skip Google's default placeholder photos (colored circle with
           // first initial). Their `default: true` flag tells us the URL
           // points to a generic avatar, not a real user-uploaded photo.
          const avatarUrl =
            p.photos?.find((ph) => !ph.default && ph.url)?.url ?? null;

          // Upsert. The unique index is (source_id, external_id), so
          // we can use ON CONFLICT.
          const upserted = await db
            .insert(rawContacts)
            .values({
              sourceId,
              externalId,
              payload: p as Record<string, unknown>,
              name,
              emails,
              phones,
              linkedinUrl,
              avatarUrl,
            })
            .onConflictDoUpdate({
              target: [rawContacts.sourceId, rawContacts.externalId],
              set: {
                payload: p as Record<string, unknown>,
                name,
                emails,
                phones,
                linkedinUrl,
                avatarUrl,
                updatedAt: new Date(),
              },
            })
            .returning({ id: rawContacts.id, createdAt: rawContacts.createdAt });

          if (upserted[0]) {
            const wasNew =
              upserted[0].createdAt &&
              Date.now() - upserted[0].createdAt.getTime() < 5_000;
            if (wasNew) counters.recordsNew += 1;
            else counters.recordsUpdated += 1;
          }
        }
        pageToken = res.data.nextPageToken ?? undefined;
      } while (pageToken);
    },
  });
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
 * Resolve a (userId, "google_contacts") pair to its sourceId.
 * Throws if not connected.
 */
export async function getGoogleContactsSourceId(userId: string): Promise<string> {
  const [src] = await db
    .select({ id: sources.id })
    .from(sources)
    .where(eq(sources.userId, userId))
    .limit(50); // we'll filter in JS — only ~3 google rows per user
  void src; // not used; full filter below

  const allRows = await db.select().from(sources).where(eq(sources.userId, userId));
  const found = allRows.find((s) => s.kind === "google_contacts");
  if (!found) throw new Error("google_contacts source not connected");
  return found.id;
}
