import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { removeItem, setItemStatus } from "@/lib/weekly-plan";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await context.params;
  const body = (await req.json()) as {
    status?: "not_yet_reached" | "reached" | "connected";
  };
  if (!body?.status) {
    return NextResponse.json({ error: "missing_status" }, { status: 400 });
  }
  await setItemStatus(user.id, id, body.status);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await context.params;
  await removeItem(user.id, id);
  return NextResponse.json({ ok: true });
}
