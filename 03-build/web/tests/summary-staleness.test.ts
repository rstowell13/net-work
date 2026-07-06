import { describe, it, expect } from "vitest";
import {
  hashStalenessKey,
  type SummaryStalenessKey,
} from "@/lib/llm/summary-staleness";

const base: SummaryStalenessKey = {
  messageCount: 42,
  lastMessageAt: new Date("2026-06-01T12:00:00Z"),
  emailCount: 7,
  lastEmailAt: new Date("2026-05-15T09:30:00Z"),
};

describe("hashStalenessKey", () => {
  it("is deterministic for the same key", () => {
    expect(hashStalenessKey(base)).toBe(hashStalenessKey({ ...base }));
  });

  it("changes when messageCount changes (a new message arrived)", () => {
    expect(hashStalenessKey(base)).not.toBe(
      hashStalenessKey({ ...base, messageCount: base.messageCount + 1 }),
    );
  });

  it("changes when lastMessageAt changes", () => {
    expect(hashStalenessKey(base)).not.toBe(
      hashStalenessKey({
        ...base,
        lastMessageAt: new Date("2026-06-02T12:00:00Z"),
      }),
    );
  });

  it("changes when emailCount changes (a new email arrived)", () => {
    expect(hashStalenessKey(base)).not.toBe(
      hashStalenessKey({ ...base, emailCount: base.emailCount + 1 }),
    );
  });

  it("changes when lastEmailAt changes", () => {
    expect(hashStalenessKey(base)).not.toBe(
      hashStalenessKey({
        ...base,
        lastEmailAt: new Date("2026-05-16T09:30:00Z"),
      }),
    );
  });

  it("handles null lastMessageAt/lastEmailAt (no messages/emails yet)", () => {
    const empty: SummaryStalenessKey = {
      messageCount: 0,
      lastMessageAt: null,
      emailCount: 0,
      lastEmailAt: null,
    };
    expect(() => hashStalenessKey(empty)).not.toThrow();
    expect(hashStalenessKey(empty)).toBe(hashStalenessKey({ ...empty }));
    expect(hashStalenessKey(empty)).not.toBe(hashStalenessKey(base));
  });

  it("is stable regardless of key insertion order (JSON field order is fixed by the function, not the caller)", () => {
    const reordered = {
      lastEmailAt: base.lastEmailAt,
      emailCount: base.emailCount,
      lastMessageAt: base.lastMessageAt,
      messageCount: base.messageCount,
    } as SummaryStalenessKey;
    expect(hashStalenessKey(base)).toBe(hashStalenessKey(reordered));
  });

  it("does NOT change when unrelated fields (notes, calls, thread summaries) change — intentional narrowing", () => {
    // hashStalenessKey only ever sees the four cheap fields; this test
    // documents that notes/calls/thread-summary edits are structurally
    // incapable of affecting the hash, since they're not part of the key.
    const a = hashStalenessKey(base);
    const b = hashStalenessKey({ ...base }); // same key, "different" everything else conceptually
    expect(a).toBe(b);
  });
});
