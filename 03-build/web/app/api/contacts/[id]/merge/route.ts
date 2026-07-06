import { NextResponse } from "next/server";
import { ApiError, handleApi, mergeErrorToApiError, requireUserApi } from "@/lib/api";
import { mergeContacts } from "@/lib/merge/apply";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Manually merge another saved contact into this one. `id` is the contact whose
 * page the user is on; `otherId` is the duplicate they picked. `keep` chooses
 * the survivor ("current" = this page, the default; "other" = the picked one).
 */
export const POST = handleApi(async (
  req: Request,
  context: { params: Promise<{ id: string }> },
) => {
  const user = await requireUserApi();
  const { id } = await context.params;

  let body: { otherId?: string; keep?: "current" | "other" };
  try {
    body = await req.json();
  } catch {
    throw new ApiError("invalid_body", 400);
  }
  if (!body.otherId) {
    throw new ApiError("missing_otherId", 400);
  }

  const keepId = body.keep === "other" ? body.otherId : id;
  const mergeId = body.keep === "other" ? id : body.otherId;

  try {
    const result = await mergeContacts(user.id, keepId, mergeId);
    return NextResponse.json(result);
  } catch (e) {
    throw mergeErrorToApiError(e);
  }
});
