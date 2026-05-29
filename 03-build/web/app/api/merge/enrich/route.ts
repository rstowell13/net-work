/**
 * Enrich existing contacts with email addresses (name/address matching) and
 * promote qualified two-way email correspondents to contacts. Then relink.
 *
 * Run after a Gmail sync + dedupe. Idempotent.
 *
 * Refs: plan Phase 1, Step 3.
 */
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { enrichAndPromote } from "@/lib/merge/promote";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  const user = await requireUser();
  const stats = await enrichAndPromote(user.id);
  return NextResponse.json(stats);
}
