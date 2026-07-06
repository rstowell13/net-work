/**
 * Manual sync trigger for one connected source.
 *
 * POST /api/sync/[source]   — [source] is the Source row's UUID (a user can
 * have several Google sources of the same kind across multiple accounts, so we
 * key on the row id, not the kind). LinkedIn is handled by the upload endpoint.
 *
 * Refs: ROADMAP M2.8
 */
import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";

// Sync work can take up to a minute on first run (Gmail header fetches
// dominate). Vercel hobby tier allows 60s for serverless functions.
export const maxDuration = 60;
export const runtime = "nodejs";

import { ApiError, handleApi, requireUserApi } from "@/lib/api";
import { db } from "@/lib/db";
import { sources } from "@/db/schema";
import { syncGoogleContacts } from "@/lib/sync/google-contacts";
import { syncGmail } from "@/lib/sync/gmail";
import { syncGoogleCalendar } from "@/lib/sync/google-calendar";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST = handleApi(async (
  _req: Request,
  context: { params: Promise<{ source: string }> },
) => {
  const user = await requireUserApi();
  const { source: sourceId } = await context.params;

  if (!UUID_RE.test(sourceId)) {
    throw new ApiError("invalid_source_id", 400);
  }

  const [src] = await db
    .select({ id: sources.id, kind: sources.kind })
    .from(sources)
    .where(and(eq(sources.id, sourceId), eq(sources.userId, user.id)))
    .limit(1);

  if (!src) {
    throw new ApiError("source_not_found", 404);
  }

  let result;
  switch (src.kind) {
    case "google_contacts":
      result = await syncGoogleContacts(src.id);
      break;
    case "gmail":
      result = await syncGmail(src.id);
      break;
    case "google_calendar":
      result = await syncGoogleCalendar(src.id);
      break;
    default:
      throw new ApiError("sync_not_supported", 400);
  }

  return NextResponse.json(result);
});
