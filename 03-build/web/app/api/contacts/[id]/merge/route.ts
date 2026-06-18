import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { mergeContacts } from "@/lib/merge/apply";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Manually merge another saved contact into this one. `id` is the contact whose
 * page the user is on; `otherId` is the duplicate they picked. `keep` chooses
 * the survivor ("current" = this page, the default; "other" = the picked one).
 */
export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await context.params;

  let body: { otherId?: string; keep?: "current" | "other" };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!body.otherId) {
    return NextResponse.json({ error: "missing_otherId" }, { status: 400 });
  }

  const keepId = body.keep === "other" ? body.otherId : id;
  const mergeId = body.keep === "other" ? id : body.otherId;

  try {
    const result = await mergeContacts(user.id, keepId, mergeId);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
