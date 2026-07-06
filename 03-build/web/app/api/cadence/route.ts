import { NextResponse } from "next/server";
import { handleApi, requireUserApi } from "@/lib/api";
import { getCadence, upsertCadence } from "@/lib/suggestions/candidates";

export const runtime = "nodejs";

export const GET = handleApi(async () => {
  const user = await requireUserApi();
  return NextResponse.json(await getCadence(user.id));
});

export const POST = handleApi(async (req: Request) => {
  const user = await requireUserApi();
  const body = (await req.json()) as Partial<{
    targetPerWeek: number;
    personalPct: number;
    minDaysSinceLastContact: number;
  }>;
  const next = await upsertCadence(user.id, body);
  return NextResponse.json(next);
});
