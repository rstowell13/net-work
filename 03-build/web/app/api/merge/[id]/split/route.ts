import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { splitCandidate } from "@/lib/merge/apply";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await context.params;
  await splitCandidate(user.id, id);
  return NextResponse.json({ ok: true });
}
