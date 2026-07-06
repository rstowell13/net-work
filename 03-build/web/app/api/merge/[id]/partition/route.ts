import { NextResponse } from "next/server";
import { ApiError, handleApi, mergeErrorToApiError, requireUserApi } from "@/lib/api";
import { partitionCandidate } from "@/lib/merge/apply";
import type { PartitionBucket } from "@/lib/merge/partition-plan";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Split a merge candidate's records across multiple people. Body:
 *   { buckets: [{ keepContactId?, name?, rawIds: string[] }, ...] }
 * Each bucket becomes one contact; records left out stay on their current one.
 */
export const POST = handleApi(async (
  _req: Request,
  context: { params: Promise<{ id: string }> },
) => {
  const user = await requireUserApi();
  const { id } = await context.params;

  let body: { buckets?: PartitionBucket[] };
  try {
    body = await _req.json();
  } catch {
    throw new ApiError("invalid_body", 400);
  }
  if (!Array.isArray(body.buckets)) {
    throw new ApiError("missing_buckets", 400);
  }

  try {
    const result = await partitionCandidate(user.id, id, body.buckets);
    return NextResponse.json(result);
  } catch (e) {
    throw mergeErrorToApiError(e);
  }
});
