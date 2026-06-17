import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getTriageRules, upsertTriageRules } from "@/lib/triage/rules";

export const runtime = "nodejs";

export async function GET() {
  const user = await requireUser();
  return NextResponse.json(await getTriageRules(user.id));
}

export async function POST(req: Request) {
  const user = await requireUser();
  const body = (await req.json()) as Partial<{
    minTwoWay: number;
    minTotal: number;
    maxAgeDays: number | null;
  }>;
  const next = await upsertTriageRules(user.id, body);
  return NextResponse.json(next);
}
