import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { ApiError, handleApi, requireUserApi } from "@/lib/api";
import { db, schema } from "@/lib/db";
import { listTags } from "@/lib/tags/queries";
import { normalizeTagName, nextTagColor, TAG_PALETTE } from "@/lib/tags/colors";

export const runtime = "nodejs";

export const GET = handleApi(async () => {
  const user = await requireUserApi();
  return NextResponse.json(await listTags(user.id));
});

export const POST = handleApi(async (req: Request) => {
  const user = await requireUserApi();
  const body = (await req.json()) as { name?: string; color?: string };
  const name = normalizeTagName(body?.name ?? "");
  if (!name) throw new ApiError("empty_name", 400);

  // Reuse an existing tag (case-insensitive) instead of creating a near-duplicate.
  const existing = await db
    .select()
    .from(schema.tags)
    .where(and(eq(schema.tags.userId, user.id), isNull(schema.tags.deletedAt)));
  const match = existing.find(
    (t) => t.name.toLowerCase() === name.toLowerCase(),
  );
  if (match) return NextResponse.json(match);

  const color =
    body?.color && (TAG_PALETTE as readonly string[]).includes(body.color)
      ? body.color
      : nextTagColor(existing.length);

  const [created] = await db
    .insert(schema.tags)
    .values({ userId: user.id, name, color })
    .returning();
  return NextResponse.json(created);
});
