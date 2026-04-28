import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { runDedupe } from "@/lib/merge/dedupe";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  const user = await requireUser();
  const stats = await runDedupe(user.id);
  return NextResponse.json(stats);
}
