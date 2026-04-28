import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { applyCandidate } from "@/lib/merge/apply";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await context.params;
  try {
    const result = await applyCandidate(user.id, id);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 400 },
    );
  }
}
