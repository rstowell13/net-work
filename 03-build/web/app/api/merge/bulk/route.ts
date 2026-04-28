import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { bulkApply } from "@/lib/merge/apply";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const user = await requireUser();
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

  const result = await bulkApply(user.id, ids);
  return NextResponse.json({ requested: ids.length, ...result });
}
