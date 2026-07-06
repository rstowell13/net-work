import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { ApiError, handleApi, requireUserApi } from "@/lib/api";
import { db, schema } from "@/lib/db";

export const runtime = "nodejs";

export const POST = handleApi(async (
  req: Request,
  context: { params: Promise<{ id: string }> },
) => {
  const user = await requireUserApi();
  const { id } = await context.params;
  const body = (await req.json()) as { status?: "active" | "never" };
  if (!body?.status)
    throw new ApiError("missing_status", 400);
  await db
    .update(schema.contacts)
    .set({ suggestionStatus: body.status, updatedAt: new Date() })
    .where(
      and(eq(schema.contacts.id, id), eq(schema.contacts.userId, user.id)),
    );
  return NextResponse.json({ ok: true });
});
