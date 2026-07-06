import { describe, it, expect } from "vitest";
import {
  truncateMessageBody,
  buildMessageToThreadMap,
  flattenMessageBatch,
  dedupeThreadsByExternalId,
  type IMessageRow,
  type IMessageThread,
} from "@/lib/sync/mac-agent-transform";

function makeThread(overrides: Partial<IMessageThread>): IMessageThread {
  return {
    external_thread_id: "thread-1",
    handle: "+15551234567",
    started_at_ms: 1000,
    ended_at_ms: 2000,
    message_count: 1,
    message_external_ids: [],
    ...overrides,
  };
}

function makeMessage(overrides: Partial<IMessageRow>): IMessageRow {
  return {
    rowid: 1,
    external_id: "msg-1",
    handle: "+15551234567",
    body: "hi",
    sent_at_ms: 1500,
    direction: "inbound",
    channel: "imessage",
    ...overrides,
  };
}

describe("truncateMessageBody", () => {
  it("passes short bodies through unchanged", () => {
    expect(truncateMessageBody("hello")).toBe("hello");
  });

  it("truncates at the 8192-char cap", () => {
    const long = "x".repeat(9000);
    const result = truncateMessageBody(long);
    expect(result.length).toBe(8192);
    expect(result).toBe(long.slice(0, 8192));
  });
});

describe("buildMessageToThreadMap", () => {
  it("maps a message whose external_id appears in a thread's message_external_ids to that thread", () => {
    const threads = [
      makeThread({
        external_thread_id: "thread-a",
        message_external_ids: ["msg-1", "msg-2"],
      }),
      makeThread({
        external_thread_id: "thread-b",
        message_external_ids: ["msg-3"],
      }),
    ];
    const map = buildMessageToThreadMap(threads);
    expect(map.get("msg-1")).toBe("thread-a");
    expect(map.get("msg-2")).toBe("thread-a");
    expect(map.get("msg-3")).toBe("thread-b");
  });

  it("messages in no thread map to nothing (undefined)", () => {
    const threads = [
      makeThread({
        external_thread_id: "thread-a",
        message_external_ids: ["msg-1"],
      }),
    ];
    const map = buildMessageToThreadMap(threads);
    expect(map.get("msg-unrelated")).toBeUndefined();
  });

  it("duplicate message ids across distinct threads resolve to the FIRST thread encountered — matching the old scan's break-on-first-match over insertion-ordered threads", () => {
    // The old code did: for (const [extId, t] of threadMap) { if
    // (t.message_external_ids.includes(m.external_id)) { ...; break; } }
    // threadMap iterates distinct external_thread_ids in first-insertion
    // order, so for a message id that (pathologically) appears in more than
    // one distinct thread's message_external_ids, the first thread in that
    // order wins.
    const threads = [
      makeThread({
        external_thread_id: "thread-first",
        message_external_ids: ["msg-shared"],
      }),
      makeThread({
        external_thread_id: "thread-second",
        message_external_ids: ["msg-shared"],
      }),
    ];
    const map = buildMessageToThreadMap(threads);
    expect(map.get("msg-shared")).toBe("thread-first");
  });

  it("empty threads list produces an empty map", () => {
    const map = buildMessageToThreadMap([]);
    expect(map.size).toBe(0);
  });
});

describe("flattenMessageBatch", () => {
  it("flattens multiple payloads' messages and threads into flat lists", () => {
    const payloads = [
      {
        messages: [makeMessage({ external_id: "m1" })],
        threads: [makeThread({ external_thread_id: "t1" })],
      },
      {
        messages: [makeMessage({ external_id: "m2" })],
        threads: [makeThread({ external_thread_id: "t2" })],
      },
    ];
    const { allMessages, allThreads } = flattenMessageBatch(payloads);
    expect(allMessages.map((m) => m.external_id)).toEqual(["m1", "m2"]);
    expect(allThreads.map((t) => t.external_thread_id)).toEqual(["t1", "t2"]);
  });

  it("handles an empty batch", () => {
    const { allMessages, allThreads } = flattenMessageBatch([]);
    expect(allMessages).toEqual([]);
    expect(allThreads).toEqual([]);
  });
});

describe("dedupeThreadsByExternalId", () => {
  it("keeps the LAST occurrence for a duplicate external_thread_id — matches the old Map.set overwrite semantics", () => {
    const threads = [
      makeThread({ external_thread_id: "t1", message_count: 5 }),
      makeThread({ external_thread_id: "t1", message_count: 99 }),
    ];
    const result = dedupeThreadsByExternalId(threads);
    expect(result).toHaveLength(1);
    expect(result[0].message_count).toBe(99);
  });

  it("preserves distinct threads untouched", () => {
    const threads = [
      makeThread({ external_thread_id: "t1" }),
      makeThread({ external_thread_id: "t2" }),
    ];
    const result = dedupeThreadsByExternalId(threads);
    expect(result.map((t) => t.external_thread_id).sort()).toEqual([
      "t1",
      "t2",
    ]);
  });
});
