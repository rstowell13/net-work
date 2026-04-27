/**
 * Source state helpers — list sources for the current user, upsert
 * connection state, etc.
 *
 * Source kinds are seeded lazily: we only create a Source row when the
 * user takes some action (clicks Connect, uploads CSV, etc.).
 */
import { eq, and } from "drizzle-orm";
import { db } from "./db";
import { sources, oauthTokens } from "@/db/schema";

export type SourceKind =
  | "apple_contacts"
  | "google_contacts"
  | "gmail"
  | "google_calendar"
  | "linkedin_csv"
  | "mac_agent";

export type SourceStatus =
  | "not_connected"
  | "connected"
  | "needs_reauth"
  | "error";

export type SourceRow = {
  id: string;
  kind: SourceKind;
  status: SourceStatus;
  lastSyncAt: Date | null;
  lastSyncError: string | null;
  config: Record<string, unknown> | null;
};

export async function getAllSourcesForUser(userId: string): Promise<SourceRow[]> {
  const rows = await db
    .select({
      id: sources.id,
      kind: sources.kind,
      status: sources.status,
      lastSyncAt: sources.lastSyncAt,
      lastSyncError: sources.lastSyncError,
      config: sources.config,
    })
    .from(sources)
    .where(eq(sources.userId, userId));
  return rows as SourceRow[];
}

/**
 * Upsert a Source row by (userId, kind). Returns the row.
 */
export async function upsertSource(args: {
  userId: string;
  kind: SourceKind;
  status: SourceStatus;
  config?: Record<string, unknown>;
}): Promise<{ id: string }> {
  const existing = await db
    .select({ id: sources.id })
    .from(sources)
    .where(and(eq(sources.userId, args.userId), eq(sources.kind, args.kind)))
    .limit(1);
  if (existing[0]) {
    await db
      .update(sources)
      .set({
        status: args.status,
        config: args.config ?? null,
        updatedAt: new Date(),
      })
      .where(eq(sources.id, existing[0].id));
    return { id: existing[0].id };
  }
  const inserted = await db
    .insert(sources)
    .values({
      userId: args.userId,
      kind: args.kind,
      status: args.status,
      config: args.config ?? null,
    })
    .returning({ id: sources.id });
  return { id: inserted[0].id };
}

/**
 * Replace the OAuthToken row for a given Source. We keep at most one
 * token per Source — earlier tokens are deleted on reconnect.
 */
export async function setOAuthToken(args: {
  sourceId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scopes: string[];
}): Promise<void> {
  await db.delete(oauthTokens).where(eq(oauthTokens.sourceId, args.sourceId));
  await db.insert(oauthTokens).values({
    sourceId: args.sourceId,
    accessToken: args.accessToken,
    refreshToken: args.refreshToken,
    expiresAt: args.expiresAt,
    scopes: args.scopes,
  });
}

/**
 * UI labels for each source kind. Used on /settings/sources cards.
 */
export const SOURCE_LABELS: Record<SourceKind, string> = {
  apple_contacts: "Apple Contacts",
  google_contacts: "Google Contacts",
  gmail: "Gmail",
  google_calendar: "Google Calendar",
  linkedin_csv: "LinkedIn CSV",
  mac_agent: "Mac agent",
};
