import { NextResponse } from "next/server";
import { ApiError, handleApi, requireUserApi } from "@/lib/api";
import { removeItem, setItemStatus } from "@/lib/weekly-plan";

export const runtime = "nodejs";

export const POST = handleApi(async (
  req: Request,
  context: { params: Promise<{ id: string }> },
) => {
  const user = await requireUserApi();
  const { id } = await context.params;
  const body = (await req.json()) as {
    status?: "not_yet_reached" | "reached" | "connected";
  };
  if (!body?.status) {
    throw new ApiError("missing_status", 400);
  }
  await setItemStatus(user.id, id, body.status);
  return NextResponse.json({ ok: true });
});

export const DELETE = handleApi(async (
  _req: Request,
  context: { params: Promise<{ id: string }> },
) => {
  const user = await requireUserApi();
  const { id } = await context.params;
  await removeItem(user.id, id);
  return NextResponse.json({ ok: true });
});
