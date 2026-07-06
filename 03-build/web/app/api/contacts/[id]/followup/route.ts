import { NextResponse } from "next/server";
import { ApiError, handleApi, requireOwnedContact, requireUserApi } from "@/lib/api";
import { db, schema } from "@/lib/db";

export const runtime = "nodejs";

export const POST = handleApi(async (
  req: Request,
  context: { params: Promise<{ id: string }> },
) => {
  const user = await requireUserApi();
  const { id } = await context.params;
  const body = (await req.json()) as { text?: string };
  if (!body?.text?.trim()) throw new ApiError("empty", 400);

  await requireOwnedContact(user.id, id);

  const [created] = await db
    .insert(schema.followUps)
    .values({
      contactId: id,
      text: body.text.trim(),
      source: "manual",
    })
    .returning();
  return NextResponse.json(created);
});
