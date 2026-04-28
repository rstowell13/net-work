/**
 * Quick read-only counts of how many diary rows are linked vs dangling.
 * For verifying that relinkAfterMerge populated contact_id correctly.
 */
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  await requireUser();
  const tables = [
    { name: "messages", table: schema.messages },
    { name: "message_threads", table: schema.messageThreads },
    { name: "emails", table: schema.emails },
    { name: "email_threads", table: schema.emailThreads },
    { name: "call_logs", table: schema.callLogs },
    { name: "calendar_events", table: schema.calendarEvents },
  ];
  const out: Record<string, { linked: number; dangling: number; total: number }> =
    {};
  for (const { name, table } of tables) {
    const [row] = await db
      .select({
        linked: sql<number>`count(*) filter (where contact_id is not null)::int`,
        dangling: sql<number>`count(*) filter (where contact_id is null)::int`,
        total: sql<number>`count(*)::int`,
      })
      .from(table);
    out[name] = row;
  }
  return NextResponse.json(out);
}
