/**
 * Mac-agent ingestion endpoints.
 *
 *   POST /api/ingest/contacts  body: { batch: AppleContact[] }
 *   POST /api/ingest/messages  body: { batch: [{ messages, threads }] }
 *   POST /api/ingest/calls     body: { batch: AppleCall[] }
 *
 * Bearer-token auth via the AgentToken table (SHA-256 of the plaintext).
 *
 * The actual ingest pipelines (contacts/messages/calls) live in
 * lib/sync/mac-agent.ts — this file is just auth, validation, dispatch,
 * and the post-ingest bookkeeping.
 *
 * Refs: ROADMAP M3.6
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sources } from "@/db/schema";
import { validateAgentToken } from "@/lib/agent-token";
import { runImport } from "@/lib/sync/run";
import {
  relinkAfterMerge,
  relinkCallsByHandles,
  relinkThreadsByHandles,
} from "@/lib/relink";
import {
  ingestContacts,
  ingestMessages,
  ingestCalls,
  type AppleContactRow,
  type IMessageRow,
  type IMessageThread,
  type CallRow,
} from "@/lib/sync/mac-agent";

export const runtime = "nodejs";
export const maxDuration = 60;

const SUPPORTED = new Set(["contacts", "messages", "calls"]);

export async function POST(
  request: Request,
  context: { params: Promise<{ kind: string }> },
) {
  const { kind } = await context.params;
  if (!SUPPORTED.has(kind)) {
    return NextResponse.json({ error: `Unsupported kind: ${kind}` }, { status: 400 });
  }

  // Bearer auth
  const auth = request.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });
  }
  const token = auth.slice(7).trim();
  const validated = await validateAgentToken(token);
  if (!validated) {
    return NextResponse.json({ error: "Invalid agent token" }, { status: 401 });
  }
  const sourceId = validated.sourceId;

  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.batch)) {
    return NextResponse.json({ error: "Expected { batch: [...] }" }, { status: 400 });
  }

  // Wrap in an ImportRun so /settings/sources shows last sync time.
  const result = await runImport({
    sourceId,
    fn: async (counters) => {
      switch (kind) {
        case "contacts":
          await ingestContacts(sourceId, body.batch as AppleContactRow[], counters);
          break;
        case "messages":
          await ingestMessages(sourceId, body.batch as { messages: IMessageRow[]; threads: IMessageThread[] }[], counters);
          break;
        case "calls":
          await ingestCalls(body.batch as CallRow[], counters);
          break;
      }
    },
  });

  // Mark mac_agent source connected the first time we get any data
  if (result.status === "success") {
    await db
      .update(sources)
      .set({ status: "connected" })
      .where(eq(sources.id, sourceId));
  }

  // After ingest, relink dangling diary rows so the diary view actually
  // shows the new data. Messages and calls batches (many per night) get a
  // relink SCOPED to the batch's handles — the global scan used to run once
  // per batch and never shrank. Contacts batches (few, and their new
  // handles can claim OLD dangling rows anywhere) keep the global pass.
  // Swallow errors — a slow relink must never fail the ingest.
  if (result.status === "success") {
    try {
      const src = await db
        .select({ userId: sources.userId })
        .from(sources)
        .where(eq(sources.id, sourceId))
        .limit(1);
      if (src[0]?.userId) {
        if (kind === "messages") {
          const groups = body.batch as { threads?: IMessageThread[] }[];
          const batchHandles = groups.flatMap(
            (g) => g.threads?.map((t) => t.handle) ?? [],
          );
          await relinkThreadsByHandles(
            src[0].userId,
            batchHandles.filter((h): h is string => !!h),
          );
        } else if (kind === "calls") {
          const calls = body.batch as { handle?: string | null }[];
          await relinkCallsByHandles(
            src[0].userId,
            calls.map((c) => c.handle).filter((h): h is string => !!h),
          );
        } else {
          await relinkAfterMerge(src[0].userId);
        }
      }
    } catch (err) {
      console.error("post-ingest relink failed", err);
    }
  }

  return NextResponse.json(result);
}
