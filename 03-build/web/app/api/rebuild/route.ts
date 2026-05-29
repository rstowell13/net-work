/**
 * One bounded pass of the Sync & rebuild pipeline (session-authed; driven by
 * the "Sync & rebuild" button which calls this in a loop until `done`).
 */
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { runRebuildPass } from "@/lib/rebuild";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const pass = await runRebuildPass(user.id);
  return NextResponse.json(pass);
}
