import { NextResponse } from "next/server";
import { handleApi, requireUserApi } from "@/lib/api";
import { getTriageRules, upsertTriageRules } from "@/lib/triage/rules";

export const runtime = "nodejs";

export const GET = handleApi(async () => {
  const user = await requireUserApi();
  return NextResponse.json(await getTriageRules(user.id));
});

export const POST = handleApi(async (req: Request) => {
  const user = await requireUserApi();
  const body = (await req.json()) as Partial<{
    minTwoWay: number;
    minTotal: number;
    maxAgeDays: number | null;
  }>;
  const next = await upsertTriageRules(user.id, body);
  return NextResponse.json(next);
});
