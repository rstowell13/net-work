import "server-only";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export type DiaryChannel =
  | "imessage"
  | "sms"
  | "email"
  | "call"
  | "event"
  | "note";

export interface DiaryEntry {
  id: string;
  channel: DiaryChannel;
  when: Date;
  title: string;
  summary: string;
  meta?: string;
  raw?: { kind: "thread" | "email" | "call" | "event" | "note"; refId: string };
}

export async function getDiary(contactId: string): Promise<DiaryEntry[]> {
  const [threads, emails, calls, events, notes] = await Promise.all([
    db
      .select({
        id: schema.messageThreads.id,
        endedAt: schema.messageThreads.endedAt,
        startedAt: schema.messageThreads.startedAt,
        messageCount: schema.messageThreads.messageCount,
        summary: schema.messageThreads.summary,
      })
      .from(schema.messageThreads)
      .where(eq(schema.messageThreads.contactId, contactId))
      .orderBy(desc(schema.messageThreads.endedAt))
      .limit(50),
    db
      .select({
        id: schema.emailThreads.id,
        endedAt: schema.emailThreads.endedAt,
        startedAt: schema.emailThreads.startedAt,
        messageCount: schema.emailThreads.messageCount,
        summary: schema.emailThreads.summary,
      })
      .from(schema.emailThreads)
      .where(eq(schema.emailThreads.contactId, contactId))
      .orderBy(desc(schema.emailThreads.endedAt))
      .limit(50),
    db
      .select()
      .from(schema.callLogs)
      .where(eq(schema.callLogs.contactId, contactId))
      .orderBy(desc(schema.callLogs.startedAt))
      .limit(50),
    db
      .select()
      .from(schema.calendarEvents)
      .where(eq(schema.calendarEvents.contactId, contactId))
      .orderBy(desc(schema.calendarEvents.startsAt))
      .limit(50),
    db
      .select()
      .from(schema.notes)
      .where(eq(schema.notes.contactId, contactId))
      .orderBy(desc(schema.notes.createdAt))
      .limit(50),
  ]);

  const out: DiaryEntry[] = [];

  for (const t of threads) {
    const dur = Math.max(
      1,
      Math.round((t.endedAt.getTime() - t.startedAt.getTime()) / 60000),
    );
    out.push({
      id: `t-${t.id}`,
      channel: "imessage",
      when: t.endedAt,
      title: `iMessage thread · ${t.messageCount} message${
        t.messageCount === 1 ? "" : "s"
      }${dur < 60 ? ` · ${dur}m` : ""}`,
      summary: t.summary ?? "",
      raw: { kind: "thread", refId: t.id },
    });
  }
  for (const t of emails) {
    out.push({
      id: `e-${t.id}`,
      channel: "email",
      when: t.endedAt,
      title: `Email thread · ${t.messageCount} message${
        t.messageCount === 1 ? "" : "s"
      }`,
      summary: t.summary ?? "",
      raw: { kind: "email", refId: t.id },
    });
  }
  for (const c of calls) {
    const min = Math.round(c.durationSeconds / 60);
    out.push({
      id: `c-${c.id}`,
      channel: "call",
      when: c.startedAt,
      title: `Phone call · ${c.direction} · ${min}m`,
      summary: "",
      meta: "Transcription will be available post-v1.",
      raw: { kind: "call", refId: c.id },
    });
  }
  for (const e of events) {
    out.push({
      id: `ev-${e.id}`,
      channel: "event",
      when: e.startsAt,
      title: `Calendar · ${e.title ?? "event"}`,
      summary: e.attendees && e.attendees.length > 0 ? `${e.attendees.length} attendees` : "",
      raw: { kind: "event", refId: e.id },
    });
  }
  for (const n of notes) {
    out.push({
      id: `n-${n.id}`,
      channel: "note",
      when: n.createdAt,
      title: "Personal note",
      summary: n.body,
      raw: { kind: "note", refId: n.id },
    });
  }

  return out.sort((a, b) => b.when.getTime() - a.when.getTime());
}

export async function getRelationshipInputs(contactId: string) {
  const [msgs, ems, cls, evts, notes] = await Promise.all([
    db
      .select({
        sentAt: schema.messages.sentAt,
        direction: schema.messages.direction,
        body: schema.messages.body,
      })
      .from(schema.messages)
      .where(eq(schema.messages.contactId, contactId))
      .orderBy(desc(schema.messages.sentAt))
      .limit(40),
    db
      .select({
        sentAt: schema.emails.sentAt,
        direction: schema.emails.direction,
        subject: schema.emails.subject,
      })
      .from(schema.emails)
      .where(eq(schema.emails.contactId, contactId))
      .orderBy(desc(schema.emails.sentAt))
      .limit(20),
    db
      .select({
        startedAt: schema.callLogs.startedAt,
        durationSeconds: schema.callLogs.durationSeconds,
      })
      .from(schema.callLogs)
      .where(eq(schema.callLogs.contactId, contactId))
      .orderBy(desc(schema.callLogs.startedAt))
      .limit(15),
    db
      .select({
        startsAt: schema.calendarEvents.startsAt,
        title: schema.calendarEvents.title,
      })
      .from(schema.calendarEvents)
      .where(eq(schema.calendarEvents.contactId, contactId))
      .orderBy(desc(schema.calendarEvents.startsAt))
      .limit(15),
    db
      .select({ body: schema.notes.body })
      .from(schema.notes)
      .where(eq(schema.notes.contactId, contactId))
      .orderBy(desc(schema.notes.createdAt))
      .limit(10),
  ]);

  return {
    recentMessages: msgs.map((m) => ({
      when: m.sentAt,
      direction: m.direction,
      body: m.body,
    })),
    recentEmails: ems.map((e) => ({
      when: e.sentAt,
      direction: e.direction,
      subject: e.subject,
    })),
    recentCalls: cls.map((c) => ({
      when: c.startedAt,
      durationSeconds: c.durationSeconds,
    })),
    recentEvents: evts.map((e) => ({
      when: e.startsAt,
      title: e.title,
    })),
    notes: notes.map((n) => n.body),
  };
}
