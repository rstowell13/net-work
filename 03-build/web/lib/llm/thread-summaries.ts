import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { fmtTime } from "@/lib/format-time";
import { summarizeThread } from "./summary";

const TRANSCRIPT_CHAR_LIMIT = 8000;

/**
 * Shared trim-loop/char-budget transcript builder for both message threads
 * and email threads — only the line separator, per-body truncation, and
 * optional subject header differ between the two.
 */
function buildTranscript<
  T extends { sentAt: Date; direction: string; body: string | null },
>(
  items: T[],
  opts: {
    separator: string;
    bodyLimit?: number;
    header?: string;
  } = { separator: "\n" },
): string {
  const { separator, bodyLimit, header = "" } = opts;
  const lines = items.map((item) => {
    const rawBody = (item.body ?? "").trim();
    const body = bodyLimit ? rawBody.slice(0, bodyLimit) : rawBody;
    return `[${item.direction === "outbound" ? "Out" : "In"} ${fmtTime(
      item.sentAt,
    )}] ${body || "(empty)"}`;
  });
  let out = lines.join(separator);
  while (header.length + out.length > TRANSCRIPT_CHAR_LIMIT && lines.length > 1) {
    lines.shift();
    out = lines.join(separator);
  }
  return header + out;
}

function buildMessageTranscript(
  messages: Array<{ sentAt: Date; direction: string; body: string | null }>,
): string {
  return buildTranscript(messages, { separator: "\n" });
}

function buildEmailTranscript(
  emails: Array<{
    sentAt: Date;
    direction: string;
    subject: string | null;
    body: string | null;
  }>,
): string {
  const subject = emails[0]?.subject?.trim();
  const header = subject ? `Subject: ${subject}\n\n` : "";
  return buildTranscript(emails, { separator: "\n\n", bodyLimit: 1500, header });
}

export async function ensureMessageThreadSummary(
  threadId: string,
): Promise<{ summary: string; generatedAt: Date } | null> {
  const [thread] = await db
    .select()
    .from(schema.messageThreads)
    .where(eq(schema.messageThreads.id, threadId))
    .limit(1);
  if (!thread || thread.messageCount === 0) return null;
  if (
    thread.summary &&
    thread.summaryMessageCount === thread.messageCount
  ) {
    return {
      summary: thread.summary,
      generatedAt: thread.summaryGeneratedAt ?? thread.updatedAt,
    };
  }

  const msgs = await db
    .select({
      sentAt: schema.messages.sentAt,
      direction: schema.messages.direction,
      body: schema.messages.body,
    })
    .from(schema.messages)
    .where(eq(schema.messages.threadId, threadId))
    .orderBy(asc(schema.messages.sentAt));
  if (msgs.length === 0) return null;

  const transcript = buildMessageTranscript(msgs);
  const summary = await summarizeThread({ transcript });
  if (!summary) {
    console.error(
      `[thread-summaries] msg thread ${threadId}: summarizeThread returned null/empty (transcript ${transcript.length} chars)`,
    );
    return null;
  }

  const now = new Date();
  await db
    .update(schema.messageThreads)
    .set({
      summary,
      summaryGeneratedAt: now,
      summaryMessageCount: thread.messageCount,
    })
    .where(eq(schema.messageThreads.id, threadId));
  return { summary, generatedAt: now };
}

export async function ensureEmailThreadSummary(
  threadId: string,
): Promise<{ summary: string; generatedAt: Date } | null> {
  const [thread] = await db
    .select()
    .from(schema.emailThreads)
    .where(eq(schema.emailThreads.id, threadId))
    .limit(1);
  if (!thread || thread.messageCount === 0) return null;
  if (
    thread.summary &&
    thread.summaryMessageCount === thread.messageCount
  ) {
    return {
      summary: thread.summary,
      generatedAt: thread.summaryGeneratedAt ?? thread.updatedAt,
    };
  }

  const ems = await db
    .select({
      sentAt: schema.emails.sentAt,
      direction: schema.emails.direction,
      subject: schema.emails.subject,
      body: schema.emails.body,
    })
    .from(schema.emails)
    .where(eq(schema.emails.threadId, threadId))
    .orderBy(asc(schema.emails.sentAt));
  if (ems.length === 0) return null;

  const transcript = buildEmailTranscript(ems);
  const summary = await summarizeThread({ transcript });
  if (!summary) {
    console.error(
      `[thread-summaries] email thread ${threadId}: summarizeThread returned null/empty`,
    );
    return null;
  }

  const now = new Date();
  await db
    .update(schema.emailThreads)
    .set({
      summary,
      summaryGeneratedAt: now,
      summaryMessageCount: thread.messageCount,
    })
    .where(eq(schema.emailThreads.id, threadId));
  return { summary, generatedAt: now };
}

async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T | null>>,
  limit: number,
): Promise<Array<T | null>> {
  const results: Array<T | null> = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (i < tasks.length) {
      const idx = i++;
      try {
        results[idx] = await tasks[idx]();
      } catch (e) {
        console.error(
          "[thread-summaries] task failed:",
          (e as Error).message,
        );
        results[idx] = null;
      }
    }
  });
  await Promise.all(workers);
  return results;
}

// Cap per-call work so a single page load can't time out (maxDuration=120s).
// User reloads or the client component re-fires until everything is summarized.
const MAX_THREADS_PER_CALL = 15;

export async function refreshContactThreadSummaries(
  contactId: string,
): Promise<{ updated: number; remaining: number }> {
  const [msgThreads, emThreads] = await Promise.all([
    db
      .select({
        id: schema.messageThreads.id,
        messageCount: schema.messageThreads.messageCount,
        summary: schema.messageThreads.summary,
        summaryMessageCount: schema.messageThreads.summaryMessageCount,
      })
      .from(schema.messageThreads)
      .where(eq(schema.messageThreads.contactId, contactId))
      .orderBy(desc(schema.messageThreads.endedAt)),
    db
      .select({
        id: schema.emailThreads.id,
        messageCount: schema.emailThreads.messageCount,
        summary: schema.emailThreads.summary,
        summaryMessageCount: schema.emailThreads.summaryMessageCount,
      })
      .from(schema.emailThreads)
      .where(eq(schema.emailThreads.contactId, contactId))
      .orderBy(desc(schema.emailThreads.endedAt)),
  ]);

  const stale = (t: {
    messageCount: number;
    summary: string | null;
    summaryMessageCount: number | null;
  }) =>
    t.messageCount > 0 &&
    (!t.summary || t.summaryMessageCount !== t.messageCount);

  const staleMsg = msgThreads.filter(stale);
  const staleEm = emThreads.filter(stale);
  const totalStale = staleMsg.length + staleEm.length;

  const allTasks: Array<() => Promise<unknown>> = [
    ...staleMsg.map((t) => () => ensureMessageThreadSummary(t.id)),
    ...staleEm.map((t) => () => ensureEmailThreadSummary(t.id)),
  ];
  const tasks = allTasks.slice(0, MAX_THREADS_PER_CALL);
  if (tasks.length === 0) return { updated: 0, remaining: 0 };

  const results = await runWithConcurrency(tasks, 3);
  const updated = results.filter((r) => r !== null).length;
  return { updated, remaining: Math.max(0, totalStale - tasks.length) };
}
