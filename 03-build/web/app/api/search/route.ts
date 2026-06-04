import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { searchAll } from "@/lib/search/queries";

export const runtime = "nodejs";

/**
 * Typeahead endpoint for the global search bar. Returns a small, capped preview
 * (5 per group) of People / Tags / Mentions. The full results live at /search.
 */
export async function GET(req: Request) {
  const user = await requireUser();
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ contacts: [], tags: [], mentions: [] });
  }
  const results = await searchAll(user.id, q, {
    contacts: 5,
    tags: 5,
    mentions: 5,
  });
  return NextResponse.json(results, {
    headers: { "Cache-Control": "no-store" },
  });
}
