import { NextResponse } from "next/server";
import { ApiError, handleApi, mergeErrorToApiError, requireUserApi } from "@/lib/api";
import { manualMerge } from "@/lib/merge/apply";

export const runtime = "nodejs";

export const POST = handleApi(async (req: Request) => {
  const user = await requireUserApi();
  const body = (await req.json().catch(() => ({}))) as {
    rawContactIds?: string[];
  };
  if (!body.rawContactIds || body.rawContactIds.length < 2) {
    throw new ApiError("need_at_least_two", 400);
  }
  try {
    const result = await manualMerge(user.id, body.rawContactIds);
    return NextResponse.json(result);
  } catch (e) {
    throw mergeErrorToApiError(e);
  }
});
