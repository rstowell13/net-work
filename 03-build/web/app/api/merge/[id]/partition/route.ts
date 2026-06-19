import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { partitionCandidate } from "@/lib/merge/apply";
import type { PartitionBucket } from "@/lib/merge/partition-plan";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Split a merge candidate's records across multiple people. Body:
 *   { buckets: [{ keepContactId?, name?, rawIds: string[] }, ...] }
 * Each bucket becomes one contact; records left out stay on their current one.
 */
export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await context.params;

  let body: { buckets?: PartitionBucket[] };
  try {
    body = await _req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!Array.isArray(body.buckets)) {
    return NextResponse.json({ error: "missing_buckets" }, { status: 400 });
  }

  try {
    const result = await partitionCandidate(user.id, id, body.buckets);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
