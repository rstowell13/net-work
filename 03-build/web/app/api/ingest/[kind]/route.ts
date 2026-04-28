/**
 * Mac-agent ingestion endpoints.
 *
 *   POST /api/ingest/contacts  body: { batch: AppleContact[] }
 *   POST /api/ingest/messages  body: { batch: [{ messages, threads }] }
 *   POST /api/ingest/calls     body: { batch: AppleCall[] }
 *
 * Bearer-token auth via the AgentToken table (SHA-256 of the plaintext).
 *
 * Refs: ROADMAP M3.6
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  rawContacts,
  messages,
  messageThreads,
  callLogs,
  sources,
} from "@/db/schema";
import { validateAgentToken } from "@/lib/agent-token";
import { runImport } from "@/lib/sync/run";

export const runtime = "nodejs";
export const maxDuration = 60;

const SUPPORTED = new Set(["contacts", "messages", "calls"]);

type AppleContactRow = {
  external_id: string;
  name: string | null;
  organization: string | null;
  emails: string[];
  phones: string[];
  linkedin_url: string | null;
  photo_b64: string | null;
};

type IMessageRow = {
  rowid: number;
  external_id: string;
  handle: string;
  body: string;
  sent_at_ms: number;
  direction: "inbound" | "outbound";
  channel: "imessage" | "sms";
};

type IMessageThread = {
  external_thread_id: string;
  handle: string;
  started_at_ms: number;
  ended_at_ms: number;
  message_count: number;
  message_external_ids: string[];
};

type CallRow = {
  z_date: number;
  external_id: string;
  handle: string;
  started_at_ms: number;
  duration_seconds: number;
  direction: "inbound" | "outbound" | "missed";
};

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

  return NextResponse.json(result);
}

// ============================================================
// Apple Contacts
// ============================================================

async function ingestContacts(
  sourceId: string,
  batch: AppleContactRow[],
  counters: { recordsSeen: number; recordsNew: number; recordsUpdated: number },
) {
  for (const c of batch) {
    counters.recordsSeen += 1;
    if (!c.external_id) continue;
    // Store the resized photo as a data: URL so the avatar component can
    // render it directly. ~25KB per contact at 256x256 JPEG.
    const avatarUrl = c.photo_b64
      ? `data:image/jpeg;base64,${c.photo_b64}`
      : null;
    const upserted = await db
      .insert(rawContacts)
      .values({
        sourceId,
        externalId: c.external_id,
        payload: c as unknown as Record<string, unknown>,
        name: c.name ?? c.organization ?? null,
        emails: c.emails.map((e) => e.toLowerCase()),
        phones: c.phones,
        linkedinUrl: c.linkedin_url,
        avatarUrl,
      })
      .onConflictDoUpdate({
        target: [rawContacts.sourceId, rawContacts.externalId],
        set: {
          payload: c as unknown as Record<string, unknown>,
          name: c.name ?? c.organization ?? null,
          emails: c.emails.map((e) => e.toLowerCase()),
          phones: c.phones,
          linkedinUrl: c.linkedin_url,
          avatarUrl,
          updatedAt: new Date(),
        },
      })
      .returning({ id: rawContacts.id, createdAt: rawContacts.createdAt });
    if (upserted[0]?.createdAt && Date.now() - upserted[0].createdAt.getTime() < 5_000) {
      counters.recordsNew += 1;
    } else {
      counters.recordsUpdated += 1;
    }
  }
}

// ============================================================
// iMessage / SMS
// ============================================================

async function ingestMessages(
  sourceId: string,
  payloads: { messages: IMessageRow[]; threads: IMessageThread[] }[],
  counters: { recordsSeen: number; recordsNew: number; recordsUpdated: number },
) {
  // Flatten the batch
  const allMessages: IMessageRow[] = [];
  const threadMap = new Map<string, IMessageThread>();
  for (const p of payloads) {
    for (const m of p.messages) allMessages.push(m);
    for (const t of p.threads) threadMap.set(t.external_thread_id, t);
  }

  // Step 1: upsert handles as raw_contacts (one per unique handle)
  const uniqueHandles = new Set(allMessages.map((m) => m.handle).filter(Boolean));
  const handleToRawId = new Map<string, string>();
  for (const handle of uniqueHandles) {
    const isEmail = handle.includes("@");
    const upserted = await db
      .insert(rawContacts)
      .values({
        sourceId,
        externalId: handle, // handle is the raw_contact external_id for mac_agent
        payload: { source: "mac_agent_imessage", handle } as Record<string, unknown>,
        name: null,
        emails: isEmail ? [handle.toLowerCase()] : [],
        phones: isEmail ? [] : [handle],
        linkedinUrl: null,
        avatarUrl: null,
      })
      .onConflictDoUpdate({
        target: [rawContacts.sourceId, rawContacts.externalId],
        set: { updatedAt: new Date() },
      })
      .returning({ id: rawContacts.id });
    if (upserted[0]) handleToRawId.set(handle, upserted[0].id);
  }

  // Step 2: upsert MessageThreads (no contactId yet — populated post-merge)
  const threadIdMap = new Map<string, string>(); // external_thread_id -> uuid
  for (const t of threadMap.values()) {
    const startedAt = new Date(t.started_at_ms);
    const endedAt = new Date(t.ended_at_ms);
    // We don't have a unique index on external_thread_id for message_threads;
    // dedupe by checking existence first.
    const existing = await db
      .select({ id: messageThreads.id })
      .from(messageThreads)
      .where(eq(messageThreads.id, messageThreads.id)) // placeholder
      .limit(0);
    void existing; // unused — see note below
    // Insert; if you re-run for existing thread the dedupe is via the
    // (handle, started_at_ms) signature which we don't enforce. For v1
    // we accept potential duplicate thread rows on heavy re-syncs and
    // resolve in the post-merge linking step. ON CONFLICT not applicable.
    const inserted = await db
      .insert(messageThreads)
      .values({
        startedAt,
        endedAt,
        messageCount: t.message_count,
      })
      .returning({ id: messageThreads.id });
    threadIdMap.set(t.external_thread_id, inserted[0].id);
    counters.recordsNew += 1;
  }

  // Step 3: upsert Messages (channel + direction + body)
  for (const m of allMessages) {
    counters.recordsSeen += 1;
    // Find the thread this message belongs to by scanning threadMap
    let threadUuid: string | null = null;
    for (const [extId, t] of threadMap) {
      if (t.message_external_ids.includes(m.external_id)) {
        threadUuid = threadIdMap.get(extId) ?? null;
        break;
      }
    }
    await db
      .insert(messages)
      .values({
        threadId: threadUuid,
        externalId: m.external_id,
        direction: m.direction,
        sentAt: new Date(m.sent_at_ms),
        body: m.body.slice(0, 8192),
        channel: m.channel,
      })
      .onConflictDoUpdate({
        target: messages.externalId,
        set: {
          threadId: threadUuid,
          direction: m.direction,
          sentAt: new Date(m.sent_at_ms),
          body: m.body.slice(0, 8192),
          channel: m.channel,
        },
      });
  }
}

// ============================================================
// Call History
// ============================================================

async function ingestCalls(
  batch: CallRow[],
  counters: { recordsSeen: number; recordsNew: number; recordsUpdated: number },
) {
  for (const c of batch) {
    counters.recordsSeen += 1;
    if (!c.external_id) continue;
    await db
      .insert(callLogs)
      .values({
        externalId: c.external_id,
        direction: c.direction,
        startedAt: new Date(c.started_at_ms),
        durationSeconds: c.duration_seconds,
      })
      .onConflictDoUpdate({
        target: callLogs.externalId,
        set: {
          direction: c.direction,
          startedAt: new Date(c.started_at_ms),
          durationSeconds: c.duration_seconds,
        },
      });
    counters.recordsNew += 1;
  }
}
