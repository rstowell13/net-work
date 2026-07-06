/**
 * Pure transform helpers for the mac-agent ingest pipelines (no DB access,
 * no `server-only` import) — split out so they're unit-testable without a
 * test database. See lib/sync/mac-agent.ts for the DB-writing pipelines
 * that use these.
 *
 * THE API CONTRACT IS FROZEN: these transforms encode data-transformation
 * semantics (body truncation, thread lookup) that deployed Mac agents
 * depend on staying byte-identical in effect.
 *
 * Refs: ROADMAP M3.6
 */

export type AppleContactRow = {
  external_id: string;
  name: string | null;
  organization: string | null;
  emails: string[];
  phones: string[];
  linkedin_url: string | null;
  photo_b64: string | null;
};

export type IMessageRow = {
  rowid: number;
  external_id: string;
  handle: string;
  body: string;
  sent_at_ms: number;
  direction: "inbound" | "outbound";
  channel: "imessage" | "sms";
  is_group?: boolean;
  sender_handle?: string | null;
};

export type IMessageThread = {
  external_thread_id: string;
  handle: string | null;
  started_at_ms: number;
  ended_at_ms: number;
  message_count: number;
  message_external_ids: string[];
  is_group?: boolean;
  group_chat_id?: string | null;
  group_display_name?: string | null;
  participant_handles?: string[];
};

export type CallRow = {
  z_date: number;
  external_id: string;
  handle: string;
  started_at_ms: number;
  duration_seconds: number;
  direction: "inbound" | "outbound" | "missed";
};

/**
 * Dedupe a batch by conflict key, keeping the LAST occurrence — matches the
 * old per-row loop's "last write wins" semantics. Required before any
 * multi-row `ON CONFLICT` statement: Postgres errors with "cannot affect row
 * a second time" if the same conflict key appears twice in one statement,
 * but the per-row loops the mac agent has always posted against silently
 * tolerated (and resolved) intra-batch duplicates.
 */
export function dedupeByKeyKeepLast<T>(
  items: T[],
  keyFn: (item: T) => string,
): T[] {
  const byKey = new Map<string, T>();
  for (const item of items) {
    byKey.set(keyFn(item), item);
  }
  return [...byKey.values()];
}

/** Truncate a message body to the 8192-char cap applied at ingest time. */
export function truncateMessageBody(body: string): string {
  return body.slice(0, 8192);
}

/** Flatten a batch of {messages, threads} payloads into one list of each. */
export function flattenMessageBatch(
  payloads: { messages: IMessageRow[]; threads: IMessageThread[] }[],
): { allMessages: IMessageRow[]; allThreads: IMessageThread[] } {
  const allMessages: IMessageRow[] = [];
  const allThreads: IMessageThread[] = [];
  for (const p of payloads) {
    for (const m of p.messages) allMessages.push(m);
    for (const t of p.threads) allThreads.push(t);
  }
  return { allMessages, allThreads };
}

/**
 * Dedupe threads by external_thread_id, keeping the last occurrence —
 * mirrors the old `threadMap.set(...)` loop over a Map keyed by thread id.
 */
export function dedupeThreadsByExternalId(
  threads: IMessageThread[],
): IMessageThread[] {
  return dedupeByKeyKeepLast(threads, (t) => t.external_thread_id);
}

/**
 * Build a reverse lookup (message external_id -> thread external_id) from a
 * batch's (already deduped, first-seen-order) threads, up front, in one
 * pass. Replaces the old per-message scan over every thread's
 * message_external_ids array (O(messages x threads)) with a Map lookup
 * (O(messages + threads)).
 *
 * Pass `threads` in the same order the old code saw them: the old scan did
 * `for (const [extId, t] of threadMap) { if
 * (t.message_external_ids.includes(m.external_id)) { ...; break; } }`, where
 * threadMap iterates DISTINCT external_thread_ids in first-insertion order
 * (see dedupeThreadsByExternalId). So if the same message external_id
 * somehow appears in more than one distinct thread's message_external_ids
 * (shouldn't happen, but batches are agent-supplied), the FIRST thread in
 * that order wins. We reproduce that by only setting a message id's mapping
 * the first time we see it (skip if already mapped).
 */
export function buildMessageToThreadMap(
  threads: IMessageThread[],
): Map<string, string> {
  const messageToThread = new Map<string, string>();
  for (const t of threads) {
    for (const msgExtId of t.message_external_ids) {
      if (!messageToThread.has(msgExtId)) {
        messageToThread.set(msgExtId, t.external_thread_id);
      }
    }
  }
  return messageToThread;
}
