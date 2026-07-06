import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { ApiError, handleApi, requireUserApi } from "@/lib/api";
import { db, schema } from "@/lib/db";
import type { CadenceWindow } from "@/lib/suggestions/tag-cadence";

export const runtime = "nodejs";

const WINDOWS: CadenceWindow[] = ["week", "month", "quarter"];

/**
 * Upsert a per-tag outreach goal. One rule per tag (delete-then-insert).
 * A targetCount of 0 just removes the goal.
 */
export const POST = handleApi(async (req: Request) => {
  const user = await requireUserApi();
  const body = (await req.json()) as {
    tagId?: string;
    targetCount?: number;
    window?: string;
  };
  if (!body.tagId) {
    throw new ApiError("no_tag", 400);
  }

  const [tag] = await db
    .select({ id: schema.tags.id })
    .from(schema.tags)
    .where(
      and(
        eq(schema.tags.id, body.tagId),
        eq(schema.tags.userId, user.id),
        isNull(schema.tags.deletedAt),
      ),
    )
    .limit(1);
  if (!tag) throw new ApiError("not_found", 404);

  await db
    .delete(schema.tagCadenceRules)
    .where(
      and(
        eq(schema.tagCadenceRules.userId, user.id),
        eq(schema.tagCadenceRules.tagId, body.tagId),
      ),
    );

  const target = Math.floor(Number(body.targetCount) || 0);
  if (target > 0) {
    const window: CadenceWindow = WINDOWS.includes(body.window as CadenceWindow)
      ? (body.window as CadenceWindow)
      : "month";
    await db.insert(schema.tagCadenceRules).values({
      userId: user.id,
      tagId: body.tagId,
      targetCount: target,
      window,
    });
  }
  return NextResponse.json({ ok: true });
});
