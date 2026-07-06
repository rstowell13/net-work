import { describe, it, expect, afterAll, beforeEach } from "vitest";
import {
  truncateAll,
  closeTestSql,
  getTestSql,
  createUser,
  createSource,
} from "../_harness";
import type { ImportCounters } from "@/lib/sync/run";
import type {
  AppleContactRow,
  IMessageRow,
  IMessageThread,
  CallRow,
} from "@/lib/sync/mac-agent-transform";

const skip = !process.env.TEST_DATABASE_URL;

function freshCounters(): ImportCounters {
  return { recordsSeen: 0, recordsNew: 0, recordsUpdated: 0 };
}

function contactRow(overrides: Partial<AppleContactRow> = {}): AppleContactRow {
  return {
    external_id: "abc-1",
    name: "Jordan Rivera",
    organization: null,
    emails: ["jordan@example.com"],
    phones: ["+15551230000"],
    linkedin_url: null,
    photo_b64: null,
    ...overrides,
  };
}

// Migrations are applied once for the whole run by globalSetup (see
// vitest.integration.config.ts + tests/integration/_global-setup.ts).
describe.skipIf(skip)("mac-agent ingest integration", () => {
  afterAll(async () => {
    await closeTestSql();
  });

  beforeEach(async () => {
    await truncateAll();
  });

  it("contacts batch upserts raw_contacts with xmax-correct recordsNew/recordsUpdated on re-run", async () => {
    const { ingestContacts } = await import("@/lib/sync/mac-agent");
    const sql = getTestSql();

    const user = await createUser();
    const source = await createSource(user.id, { kind: "apple_contacts" });

    const first = freshCounters();
    await ingestContacts(source.id, [contactRow()], first);
    expect(first.recordsNew).toBe(1);
    expect(first.recordsUpdated).toBe(0);
    expect(first.recordsSeen).toBe(1);

    const second = freshCounters();
    await ingestContacts(
      source.id,
      [contactRow({ name: "Jordan R." })],
      second,
    );
    expect(second.recordsNew).toBe(0);
    expect(second.recordsUpdated).toBe(1);
    expect(second.recordsSeen).toBe(1);

    const rows = await sql`
      SELECT name FROM raw_contacts WHERE source_id = ${source.id}
    `;
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe("Jordan R.");
  });

  it("messages batch creates threads+messages with correct thread mapping", async () => {
    const { ingestMessages } = await import("@/lib/sync/mac-agent");
    const sql = getTestSql();

    const user = await createUser();
    const source = await createSource(user.id, { kind: "mac_agent" });

    const thread: IMessageThread = {
      external_thread_id: "thread-ext-1",
      handle: "+15559998888",
      started_at_ms: Date.parse("2026-01-01T00:00:00Z"),
      ended_at_ms: Date.parse("2026-01-01T01:00:00Z"),
      message_count: 2,
      message_external_ids: ["msg-1", "msg-2"],
    };
    const messages: IMessageRow[] = [
      {
        rowid: 1,
        external_id: "msg-1",
        handle: "+15559998888",
        body: "hey",
        sent_at_ms: Date.parse("2026-01-01T00:00:00Z"),
        direction: "inbound",
        channel: "imessage",
      },
      {
        rowid: 2,
        external_id: "msg-2",
        handle: "+15559998888",
        body: "what's up",
        sent_at_ms: Date.parse("2026-01-01T00:30:00Z"),
        direction: "outbound",
        channel: "imessage",
      },
    ];

    const counters = freshCounters();
    await ingestMessages(
      source.id,
      [{ messages, threads: [thread] }],
      counters,
    );

    const threadRows = await sql`
      SELECT id, external_thread_id FROM message_threads
      WHERE external_thread_id = 'thread-ext-1'
    `;
    expect(threadRows.length).toBe(1);
    const threadId = threadRows[0].id;

    const messageRows = await sql`
      SELECT external_id, thread_id FROM messages
      WHERE external_id IN ('msg-1', 'msg-2')
      ORDER BY external_id
    `;
    expect(messageRows.length).toBe(2);
    expect(messageRows[0].thread_id).toBe(threadId);
    expect(messageRows[1].thread_id).toBe(threadId);

    void user;
  });

  it("intra-batch duplicate external_ids don't error (last-write-wins)", async () => {
    const { ingestContacts, ingestCalls } = await import("@/lib/sync/mac-agent");
    const sql = getTestSql();

    const user = await createUser();
    const source = await createSource(user.id, { kind: "apple_contacts" });

    const counters = freshCounters();
    await expect(
      ingestContacts(
        source.id,
        [
          contactRow({ external_id: "dup-1", name: "First Write" }),
          contactRow({ external_id: "dup-1", name: "Second Write" }),
        ],
        counters,
      ),
    ).resolves.not.toThrow();

    const rows = await sql`
      SELECT name FROM raw_contacts WHERE source_id = ${source.id} AND external_id = 'dup-1'
    `;
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe("Second Write"); // last write wins

    const callCounters = freshCounters();
    const dupCalls: CallRow[] = [
      {
        z_date: 1,
        external_id: "call-dup-1",
        handle: "+15551112222",
        started_at_ms: Date.parse("2026-01-01T00:00:00Z"),
        duration_seconds: 10,
        direction: "outbound",
      },
      {
        z_date: 1,
        external_id: "call-dup-1",
        handle: "+15551112222",
        started_at_ms: Date.parse("2026-01-01T00:05:00Z"),
        duration_seconds: 42,
        direction: "outbound",
      },
    ];
    await expect(
      ingestCalls(dupCalls, callCounters),
    ).resolves.not.toThrow();

    const callRows = await sql`
      SELECT duration_seconds FROM call_logs WHERE external_id = 'call-dup-1'
    `;
    expect(callRows.length).toBe(1);
    expect(callRows[0].duration_seconds).toBe(42); // last write wins
  });
});
