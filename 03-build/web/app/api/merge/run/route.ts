import { NextResponse } from "next/server";
import { handleApi, requireUserApi } from "@/lib/api";
import { runDedupe } from "@/lib/merge/dedupe";

export const runtime = "nodejs";
export const maxDuration = 60;

export const POST = handleApi(async () => {
  const user = await requireUserApi();
  const stats = await runDedupe(user.id);
  return NextResponse.json(stats);
});
