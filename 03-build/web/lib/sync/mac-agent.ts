/**
 * Mac-agent ingestion pipelines — Apple Contacts, iMessage/SMS, and Call
 * History, all posted by the on-Mac LaunchAgent to /api/ingest/[kind].
 *
 * THE API CONTRACT IS FROZEN: deployed Mac agents post to these endpoints
 * with no version handshake. Row shapes and all transformation semantics
 * (handle normalization, group-thread participant handling, body
 * truncation, avatar data-URLs, intra-batch dedupe) must stay byte-
 * identical in effect — see app/api/ingest/[kind]/route.ts for the auth +
 * dispatch shell that calls into this file.
 *
 * Refs: ROADMAP M3.6
 */
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { rawContacts, messages, messageThreads, callLogs } from "@/db/schema";
import { normalizeHandle } from "@/lib/handles";
import type { ImportCounters } from "./run";
import {
  dedupeByKeyKeepLast,
  truncateMessageBody,
  flattenMessageBatch,
  dedupeThreadsByExternalId,
  buildMessageToThreadMap,
  type AppleContactRow,
  type IMessageRow,
  type IMessageThread,
  type CallRow,
} from "./mac-agent-transform";

// Re-export so route.ts (and any other caller) can import both the pipelines
// and their row types / pure transforms from this one module.
export {
  truncateMessageBody,
  flattenMessageBatch,
  dedupeThreadsByExternalId,
  buildMessageToThreadMap,
};
export type { AppleContactRow, IMessageRow, IMessageThread, CallRow };

// Chunk multi-row upserts so a single statement's value list stays bounded —
// message bodies can be up to 8KB each, so 500 rows keeps a statement well
// under Postgres/pg wire limits while still cutting round-trips ~500x vs.
// one-row-at-a-time.
const UPSERT_CHUNK_SIZE = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

// ============================================================
// Apple Contacts
// ============================================================

export async function ingestContacts(
  sourceId: string,
  batch: AppleContactRow[],
  counters: ImportCounters,
) {
  const withId = batch.filter((c) => {
    counters.recordsSeen += 1;
    return !!c.external_id;
  });
  // Intra-batch dedupe: the per-row loop this replaces silently let a later
  // contact with the same external_id overwrite an earlier one within the
  // same POST — a multi-row ON CONFLICT statement errors on that instead, so
  // dedupe first, keeping the last occurrence to match.
  const deduped = dedupeByKeyKeepLast(withId, (c) => c.external_id);

  for (const batchRows of chunk(deduped, UPSERT_CHUNK_SIZE)) {
    const values = batchRows.map((c) => {
      // Store the resized photo as a data: URL so the avatar component can
      // render it directly. ~25KB per contact at 256x256 JPEG.
      const avatarUrl = c.photo_b64
        ? `data:image/jpeg;base64,${c.photo_b64}`
        : null;
      return {
        sourceId,
        externalId: c.external_id,
        payload: c as unknown as Record<string, unknown>,
        name: c.name ?? c.organization ?? null,
        emails: c.emails.map((e) => e.toLowerCase()),
        phones: c.phones,
        linkedinUrl: c.linkedin_url,
        avatarUrl,
      };
    });
    const upserted = await db
      .insert(rawContacts)
      .values(values)
      .onConflictDoUpdate({
        target: [rawContacts.sourceId, rawContacts.externalId],
        set: {
          payload: sql`excluded.payload`,
          name: sql`excluded.name`,
          emails: sql`excluded.emails`,
          phones: sql`excluded.phones`,
          linkedinUrl: sql`excluded.linkedin_url`,
          avatarUrl: sql`excluded.avatar_url`,
          updatedAt: new Date(),
        },
      })
      .returning({ id: rawContacts.id, inserted: sql<boolean>`(xmax = 0)` });
    for (const row of upserted) {
      if (row.inserted) counters.recordsNew += 1;
      else counters.recordsUpdated += 1;
    }
  }
}

// ============================================================
// iMessage / SMS
// ============================================================

export async function ingestMessages(
  sourceId: string,
  payloads: { messages: IMessageRow[]; threads: IMessageThread[] }[],
  counters: ImportCounters,
) {
  // Flatten the batch, then dedupe threads by external_thread_id (keep-last)
  // exactly as the old `threadMap.set(...)` loop did.
  const { allMessages, allThreads: rawThreads } = flattenMessageBatch(payloads);
  const dedupedThreads = dedupeThreadsByExternalId(rawThreads);

  // Step 1: upsert handles as raw_contacts (one per unique handle), batched.
  const uniqueHandles = [
    ...new Set(allMessages.map((m) => m.handle).filter(Boolean)),
  ];
  const handleToRawId = new Map<string, string>();
  for (const handleBatch of chunk(uniqueHandles, UPSERT_CHUNK_SIZE)) {
    const values = handleBatch.map((handle) => {
      const isEmail = handle.includes("@");
      return {
        sourceId,
        externalId: handle, // handle is the raw_contact external_id for mac_agent
        payload: { source: "mac_agent_imessage", handle } as Record<
          string,
          unknown
        >,
        name: null,
        emails: isEmail ? [handle.toLowerCase()] : [],
        phones: isEmail ? [] : [handle],
        linkedinUrl: null,
        avatarUrl: null,
      };
    });
    const upserted = await db
      .insert(rawContacts)
      .values(values)
      .onConflictDoUpdate({
        target: [rawContacts.sourceId, rawContacts.externalId],
        set: { updatedAt: new Date() },
      })
      .returning({ id: rawContacts.id, externalId: rawContacts.externalId });
    for (const row of upserted) {
      handleToRawId.set(row.externalId, row.id);
    }
  }

  // Step 2: upsert MessageThreads (no contactId yet — populated post-merge
  // by lib/relink.ts), batched.
  const threadIdMap = new Map<string, string>(); // external_thread_id -> uuid
  for (const threadBatch of chunk(dedupedThreads, UPSERT_CHUNK_SIZE)) {
    const values = threadBatch.map((t) => {
      const isGroup = t.is_group ?? false;
      // Group threads have no single handle — they match contacts at read
      // time via the normalized participant roster (see lib/diary.ts).
      const handle = isGroup ? null : t.handle ?? null;
      const groupChatId = isGroup ? t.group_chat_id ?? null : null;
      const groupDisplayName = isGroup ? t.group_display_name ?? null : null;
      const participantHandles = isGroup
        ? Array.from(
            new Set(
              (t.participant_handles ?? [])
                .map(normalizeHandle)
                .filter((h): h is string => h !== null),
            ),
          )
        : null;
      return {
        externalThreadId: t.external_thread_id,
        handle,
        startedAt: new Date(t.started_at_ms),
        endedAt: new Date(t.ended_at_ms),
        messageCount: t.message_count,
        isGroup,
        groupChatId,
        groupDisplayName,
        participantHandles,
      };
    });
    const inserted = await db
      .insert(messageThreads)
      .values(values)
      .onConflictDoUpdate({
        target: messageThreads.externalThreadId,
        set: {
          handle: sql`excluded.handle`,
          startedAt: sql`excluded.started_at`,
          endedAt: sql`excluded.ended_at`,
          messageCount: sql`excluded.message_count`,
          isGroup: sql`excluded.is_group`,
          groupChatId: sql`excluded.group_chat_id`,
          groupDisplayName: sql`excluded.group_display_name`,
          participantHandles: sql`excluded.participant_handles`,
          updatedAt: new Date(),
        },
      })
      .returning({
        id: messageThreads.id,
        externalThreadId: messageThreads.externalThreadId,
      });
    for (const row of inserted) {
      // externalThreadId is nullable in the schema type but we always
      // provide one on insert, so it's never null in this returning set.
      if (row.externalThreadId) threadIdMap.set(row.externalThreadId, row.id);
      counters.recordsNew += 1;
    }
  }

  // Step 3: upsert Messages (channel + direction + body), batched. Look up
  // each message's thread via a single prebuilt reverse map instead of
  // scanning every thread's message_external_ids per message.
  const messageToThreadExtId = buildMessageToThreadMap(dedupedThreads);
  // Intra-batch dedupe on externalId, keep-last — matches the old loop's
  // per-row onConflictDoUpdate, which let a later duplicate overwrite an
  // earlier one within the same POST.
  const dedupedMessages = dedupeByKeyKeepLast(
    allMessages,
    (m) => m.external_id,
  );
  counters.recordsSeen += allMessages.length;

  for (const messageBatch of chunk(dedupedMessages, UPSERT_CHUNK_SIZE)) {
    const values = messageBatch.map((m) => {
      const threadExtId = messageToThreadExtId.get(m.external_id);
      const threadUuid = threadExtId
        ? threadIdMap.get(threadExtId) ?? null
        : null;
      return {
        threadId: threadUuid,
        externalId: m.external_id,
        direction: m.direction,
        sentAt: new Date(m.sent_at_ms),
        body: truncateMessageBody(m.body),
        channel: m.channel,
        isGroup: m.is_group ?? false,
        senderHandle: m.sender_handle ?? null,
      };
    });
    await db
      .insert(messages)
      .values(values)
      .onConflictDoUpdate({
        target: messages.externalId,
        set: {
          threadId: sql`excluded.thread_id`,
          direction: sql`excluded.direction`,
          sentAt: sql`excluded.sent_at`,
          body: sql`excluded.body`,
          channel: sql`excluded.channel`,
          isGroup: sql`excluded.is_group`,
          senderHandle: sql`excluded.sender_handle`,
        },
      });
  }
}

// ============================================================
// Call History
// ============================================================

export async function ingestCalls(batch: CallRow[], counters: ImportCounters) {
  const withId = batch.filter((c) => !!c.external_id);
  // Intra-batch dedupe (keep-last) — the calls path already batched, but
  // relied on Postgres accepting one row per external_id; a duplicate
  // external_id within a single agent POST would have hit "cannot affect
  // row a second time" already. Dedupe defensively for consistency with the
  // other two paths.
  const deduped = dedupeByKeyKeepLast(withId, (c) => c.external_id);
  const rows = deduped.map((c) => ({
    externalId: c.external_id,
    handle: c.handle ?? null,
    direction: c.direction,
    startedAt: new Date(c.started_at_ms),
    durationSeconds: c.duration_seconds,
  }));
  counters.recordsSeen += batch.length;
  if (rows.length === 0) return;
  // Matches the pre-extraction behavior: every upserted row (insert or
  // update) counts as recordsNew. Calls never got the xmax-based
  // inserted/updated split that contacts has — not changing that here,
  // only chunking so a very large batch stays under statement limits.
  for (const rowBatch of chunk(rows, UPSERT_CHUNK_SIZE)) {
    await db
      .insert(callLogs)
      .values(rowBatch)
      .onConflictDoUpdate({
        target: callLogs.externalId,
        set: {
          handle: sql`excluded.handle`,
          direction: sql`excluded.direction`,
          startedAt: sql`excluded.started_at`,
          durationSeconds: sql`excluded.duration_seconds`,
        },
      });
    counters.recordsNew += rowBatch.length;
  }
}
