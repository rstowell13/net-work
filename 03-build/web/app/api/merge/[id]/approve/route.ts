import { NextResponse } from "next/server";
import { handleApi, mergeErrorToApiError, requireUserApi } from "@/lib/api";
import { applyCandidate } from "@/lib/merge/apply";

export const runtime = "nodejs";

export const POST = handleApi(async (
  _req: Request,
  context: { params: Promise<{ id: string }> },
) => {
  const user = await requireUserApi();
  const { id } = await context.params;
  try {
    const result = await applyCandidate(user.id, id);
    return NextResponse.json(result);
  } catch (e) {
    throw mergeErrorToApiError(e);
  }
});
