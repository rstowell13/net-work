import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { handleApi, requireUserApi } from "@/lib/api";
import { db, schema } from "@/lib/db";
import { bulkApply } from "@/lib/merge/apply";

export const runtime = "nodejs";
export const maxDuration = 60;

export const POST = handleApi(async (req: Request) => {
  const user = await requireUserApi();
  const body = (await req.json().catch(() => ({}))) as {
    candidateIds?: string[];
    confidences?: Array<"exact" | "high" | "ambiguous">;
  };

  let ids = body.candidateIds ?? [];
  if (ids.length === 0 && body.confidences && body.confidences.length > 0) {
    const rows = await db
      .select({ id: schema.mergeCandidates.id })
      .from(schema.mergeCandidates)
      .where(
        and(
          eq(schema.mergeCandidates.userId, user.id),
          eq(schema.mergeCandidates.status, "pending"),
          inArray(schema.mergeCandidates.confidence, body.confidences),
        ),
      );
    ids = rows.map((r) => r.id);
  }

  // Skip the per-merge diary relink — it scans the diary tables on every merge
  // and is what blows the function timeout on large batches. The client sends
  // small chunks and calls /api/merge/relink once at the end (one global pass).
  const result = await bulkApply(user.id, ids, { relink: false });
  return NextResponse.json({ requested: ids.length, ...result });
});
