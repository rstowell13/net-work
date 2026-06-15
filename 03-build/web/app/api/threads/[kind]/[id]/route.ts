import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { normalizeHandle } from "@/lib/handles";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  context: { params: Promise<{ kind: string; id: string }> },
) {
  const user = await requireUser();
  const { kind, id } = await context.params;

  if (kind === "message") {
    const [thread] = await db
      .select()
      .from(schema.messageThreads)
      .where(eq(schema.messageThreads.id, id))
      .limit(1);
    if (!thread)
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    const msgs = await db
      .select({
        id: schema.messages.id,
        direction: schema.messages.direction,
        sentAt: schema.messages.sentAt,
        body: schema.messages.body,
        channel: schema.messages.channel,
        senderHandle: schema.messages.senderHandle,
      })
      .from(schema.messages)
      .where(eq(schema.messages.threadId, id))
      .orderBy(asc(schema.messages.sentAt));

    // Group threads: label each inbound message with its sender's contact name
    // (falling back to the raw handle). Resolution only runs for group threads.
    let nameByHandle: Map<string, string> | null = null;
    if (thread.isGroup) {
      const rawRows = await db
        .select({
          emails: schema.rawContacts.emails,
          phones: schema.rawContacts.phones,
          displayName: schema.contacts.displayName,
        })
        .from(schema.rawContacts)
        .innerJoin(
          schema.contacts,
          eq(schema.contacts.id, schema.rawContacts.contactId),
        )
        .where(eq(schema.contacts.userId, user.id));
      nameByHandle = new Map<string, string>();
      for (const r of rawRows) {
        if (!r.displayName) continue;
        for (const h of [...(r.emails ?? []), ...(r.phones ?? [])]) {
          const n = normalizeHandle(h);
          if (n && !nameByHandle.has(n)) nameByHandle.set(n, r.displayName);
        }
      }
    }

    const out = msgs.map((m) => {
      const n = m.senderHandle ? normalizeHandle(m.senderHandle) : null;
      const sender = m.senderHandle
        ? (n && nameByHandle?.get(n)) || m.senderHandle
        : null;
      return {
        id: m.id,
        direction: m.direction,
        sentAt: m.sentAt,
        body: m.body,
        channel: m.channel,
        sender,
      };
    });

    return NextResponse.json({
      kind: "message",
      messages: out,
      summary: thread.summary,
      isGroup: thread.isGroup,
      groupDisplayName: thread.groupDisplayName,
    });
  }

  if (kind === "email") {
    const [thread] = await db
      .select()
      .from(schema.emailThreads)
      .where(eq(schema.emailThreads.id, id))
      .limit(1);
    if (!thread)
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    const ems = await db
      .select({
        id: schema.emails.id,
        direction: schema.emails.direction,
        sentAt: schema.emails.sentAt,
        subject: schema.emails.subject,
        body: schema.emails.body,
        fromEmail: schema.emails.fromEmail,
        toEmails: schema.emails.toEmails,
      })
      .from(schema.emails)
      .where(eq(schema.emails.threadId, id))
      .orderBy(asc(schema.emails.sentAt));
    return NextResponse.json({
      kind: "email",
      messages: ems,
      summary: thread.summary,
    });
  }

  return NextResponse.json({ error: "bad_kind" }, { status: 400 });
}
