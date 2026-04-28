/**
 * One-off bulk relink for the current user. Walks every contact, stamps
 * diary tables (messages, emails, calls, calendar) with contact_id where
 * handle / from_email / attendee matches.
 *
 * Useful after M4 to backfill diary rows that were ingested in M3 before
 * any Contact rows existed. Idempotent.
 */
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { relinkAfterMerge } from "@/lib/relink";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  const user = await requireUser();
  const stats = await relinkAfterMerge(user.id);
  return NextResponse.json(stats);
}
