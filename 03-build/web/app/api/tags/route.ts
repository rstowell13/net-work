import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { listTags } from "@/lib/tags/queries";
import { normalizeTagName, nextTagColor, TAG_PALETTE } from "@/lib/tags/colors";

export const runtime = "nodejs";

export async function GET() {
  const user = await requireUser();
  return NextResponse.json(await listTags(user.id));
}

export async function POST(req: Request) {
  const user = await requireUser();
  const body = (await req.json()) as { name?: string; color?: string };
  const name = normalizeTagName(body?.name ?? "");
  if (!name) return NextResponse.json({ error: "empty_name" }, { status: 400 });

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
}
