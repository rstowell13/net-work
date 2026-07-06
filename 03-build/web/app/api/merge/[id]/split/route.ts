import { NextResponse } from "next/server";
import { handleApi, requireUserApi } from "@/lib/api";
import { splitCandidate } from "@/lib/merge/apply";

export const runtime = "nodejs";

export const POST = handleApi(async (
  _req: Request,
  context: { params: Promise<{ id: string }> },
) => {
  const user = await requireUserApi();
  const { id } = await context.params;
  await splitCandidate(user.id, id);
  return NextResponse.json({ ok: true });
});
