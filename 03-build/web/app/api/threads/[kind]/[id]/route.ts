import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  context: { params: Promise<{ kind: string; id: string }> },
) {
  await requireUser();
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
      })
      .from(schema.messages)
      .where(eq(schema.messages.threadId, id))
      .orderBy(asc(schema.messages.sentAt));
    return NextResponse.json({
      kind: "message",
      messages: msgs,
      summary: thread.summary,
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
