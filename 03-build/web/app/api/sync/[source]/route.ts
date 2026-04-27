/**
 * Manual sync trigger.
 *
 * POST /api/sync/[source]
 *   source ∈ { google_contacts, gmail, google_calendar }
 *   (LinkedIn is handled by the file upload endpoint, not here.)
 *
 * Refs: ROADMAP M2.8
 */
import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";

// Sync work can take up to a minute on first run (Gmail header fetches
// dominate). Vercel hobby tier allows 60s for serverless functions.
export const maxDuration = 60;
export const runtime = "nodejs";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { sources } from "@/db/schema";
import { syncGoogleContacts } from "@/lib/sync/google-contacts";
import { syncGmail } from "@/lib/sync/gmail";
import { syncGoogleCalendar } from "@/lib/sync/google-calendar";

const SUPPORTED = new Set(["google_contacts", "gmail", "google_calendar"]);

export async function POST(
  _req: Request,
  context: { params: Promise<{ source: string }> },
) {
  const user = await requireUser();
  const { source } = await context.params;

  if (!SUPPORTED.has(source)) {
    return NextResponse.json(
      { error: `Unsupported source: ${source}` },
      { status: 400 },
    );
  }

  const [src] = await db
    .select({ id: sources.id, status: sources.status })
    .from(sources)
    .where(
      and(
        eq(sources.userId, user.id),
        eq(sources.kind, source as "google_contacts" | "gmail" | "google_calendar"),
      ),
    )
    .limit(1);

  if (!src) {
    return NextResponse.json(
      { error: `Source ${source} is not connected` },
      { status: 404 },
    );
  }

  let result;
  switch (source) {
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
      return NextResponse.json({ error: "unreachable" }, { status: 500 });
  }

  return NextResponse.json(result);
}
