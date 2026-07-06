/**
 * Pure staleness-key hashing for the relationship summary cache — no DB or
 * server-only imports, so it's unit-testable in isolation. See lib/diary.ts
 * getRelationshipStalenessInputs for how the key itself is computed (one
 * cheap aggregate query: counts + max(sent_at), no message/email bodies)
 * and lib/llm/summary.ts for how the hash gates cache validity.
 *
 * Deliberately narrower than hashing the full RelationshipInputs (the old
 * behavior): only new messages/emails change this hash. Notes, calls,
 * calendar events, and thread-summary edits no longer invalidate the cache
 * on their own — an intentional cost-control tradeoff (see P9 commit).
 */
import { createHash } from "node:crypto";

export interface SummaryStalenessKey {
  messageCount: number;
  lastMessageAt: Date | null;
  emailCount: number;
  lastEmailAt: Date | null;
}

export function hashStalenessKey(key: SummaryStalenessKey): string {
  return createHash("sha1")
    .update(
      JSON.stringify({
        messageCount: key.messageCount,
        lastMessageAt: key.lastMessageAt?.toISOString() ?? null,
        emailCount: key.emailCount,
        lastEmailAt: key.lastEmailAt?.toISOString() ?? null,
      }),
    )
    .digest("hex")
    .slice(0, 16);
}
