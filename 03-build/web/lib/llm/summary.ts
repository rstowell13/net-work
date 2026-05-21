import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { chat, LLMConfigError } from "./client";

const SYSTEM_PROMPT_RELATIONSHIP = [
  "State who this person is to the user — the role they play and the recurring substance of the relationship. That is the entire output.",
  "Length: 150–300 characters (1–2 sentences). Hit at least 150 characters; do not pad with filler.",
  "Use interaction patterns (frequency, tone, topics, channel mix) as private input — never describe HOW you inferred it, never quote the data, never narrate the messages.",
  "Banned phrases: 'discussing', 'exchanging messages', 'topics like', 'in a ... manner', 'suggests', 'indicating', 'with a focus on', 'back-and-forth'.",
  "Cover, where the data supports it: their role in your life (close friend / family / colleague / professional contact / acquaintance), the texture of contact (warm and frequent / steady but light / occasional / dormant), and the recurring substance (kids, sports, business deals, planning trips, family logistics, etc.).",
  "Second-person ('you'). No greeting, no headers.",
  "Good: 'A close friend and frequent texting partner — sports, kids, fantasy leagues, and the kind of fast casual back-channel you reach for first when something weird happens in the news.'",
  "Good: 'A work-adjacent contact you trade emails with around scheduling and deal logistics, with the occasional warmer message about family or travel — friendly but not personal.'",
  "Good: 'A long-running family-side relationship you keep alive in steady light touches: holiday check-ins, kids' updates, the occasional plan to visit, never urgent.'",
  "Recent conversation is shown in full; older history is condensed as topic tags per thread. Weight whichever block reflects the active relationship — for a current relationship the recent texture matters most; for someone you used to be close with and want to reconnect, the older tag list shows what you used to talk about.",
  "If data is too sparse to characterize, say exactly: 'Not enough interaction yet to characterize this relationship.' and stop.",
].join(" ");

const SYSTEM_PROMPT_THREAD = [
  "List the topics and key details from this thread as a comma-separated phrase (under 45 words).",
  "Do NOT narrate. Do NOT use pronouns. Do NOT say who said what. Do NOT use full sentences.",
  "Do NOT include any dates, days of the week, times, or relative time references — the diary already shows when.",
  "Just subject matter and concrete specifics (names, places, prices, decisions) — like an expanded tag list.",
  "Examples: 'Indian Wells trip planning, Grand Hyatt Champions Suite, $40k rate, baseball playoffs forced trip up, free buffet and resort credit'",
  "         'lunch logistics at Sweetgreen, rescheduled meetup, parking validation'",
  "         'Marcus Smart trade rumor, Celtics reaction, polymarket odds, NBA playoffs commentary'",
].join(" ");

export interface RelationshipInputs {
  contactName: string;
  category: string | null;
  notes: string[];
  rawMessages: Array<{
    when: Date;
    direction: string;
    body: string | null;
    threadId: string | null;
  }>;
  rawEmails: Array<{
    when: Date;
    direction: string;
    subject: string | null;
    body: string | null;
    threadId: string | null;
  }>;
  recentCalls: Array<{ when: Date; durationSeconds: number }>;
  recentEvents: Array<{ when: Date; title: string | null }>;
  threadHistory: Array<{
    when: Date;
    kind: "message" | "email";
    threadId: string;
    summary: string;
  }>;
  callTranscripts: Array<{ when: Date; transcript: string }>;
}

const RAW_BODY_BUDGET = 60000;
const MAX_ITEM_BODY = 12000;

function hashInputs(inputs: RelationshipInputs): string {
  return createHash("sha1")
    .update(JSON.stringify(inputs))
    .digest("hex")
    .slice(0, 16);
}

type RawItem =
  | {
      kind: "msg";
      when: Date;
      direction: string;
      body: string | null;
      threadId: string | null;
    }
  | {
      kind: "email";
      when: Date;
      direction: string;
      subject: string | null;
      body: string | null;
      threadId: string | null;
    };

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function renderRelationshipUserMsg(i: RelationshipInputs): string {
  const lines: string[] = [];
  lines.push(`Contact: ${i.contactName}${i.category ? ` (${i.category})` : ""}`);
  if (i.notes.length > 0) {
    lines.push("\nNotes you've written:");
    i.notes.slice(0, 10).forEach((n) => lines.push(`- ${n}`));
  }

  // Interleave messages + emails newest-first and pack into the raw-body
  // budget. Track which threadIds get consumed so we don't double-cover them
  // in the older-history block below.
  const interleaved: RawItem[] = [
    ...i.rawMessages.map<RawItem>((m) => ({
      kind: "msg",
      when: m.when,
      direction: m.direction,
      body: m.body,
      threadId: m.threadId,
    })),
    ...i.rawEmails.map<RawItem>((e) => ({
      kind: "email",
      when: e.when,
      direction: e.direction,
      subject: e.subject,
      body: e.body,
      threadId: e.threadId,
    })),
  ].sort((a, b) => b.when.getTime() - a.when.getTime());

  const consumedThreads = new Set<string>();
  const recentMsgLines: string[] = [];
  const recentEmailLines: string[] = [];
  let usedChars = 0;
  let earliestRawAt: Date | null = null;
  let latestRawAt: Date | null = null;

  for (const item of interleaved) {
    if (usedChars >= RAW_BODY_BUDGET) break;
    const body = (item.kind === "email"
      ? item.body ?? item.subject ?? ""
      : item.body ?? ""
    )
      .toString()
      .slice(0, MAX_ITEM_BODY)
      .trim();
    if (!body) continue;
    let line: string;
    if (item.kind === "msg") {
      line = `- ${fmtDate(item.when)} (${item.direction}) ${body}`;
      recentMsgLines.push(line);
    } else {
      const subj = item.subject?.trim() || "(no subject)";
      line = `- ${fmtDate(item.when)} (${item.direction}) [${subj}]\n${body}`;
      recentEmailLines.push(line);
    }
    usedChars += line.length + 1;
    if (item.threadId) consumedThreads.add(item.threadId);
    if (!latestRawAt || item.when > latestRawAt) latestRawAt = item.when;
    if (!earliestRawAt || item.when < earliestRawAt) earliestRawAt = item.when;
  }

  if (recentMsgLines.length > 0) {
    lines.push(
      `\nRecent messages (full text, ${recentMsgLines.length} shown):`,
    );
    lines.push(...recentMsgLines);
  }
  if (recentEmailLines.length > 0) {
    lines.push(
      `\nRecent emails (full text, ${recentEmailLines.length} shown):`,
    );
    lines.push(...recentEmailLines);
  }

  if (i.recentCalls.length > 0) {
    lines.push("\nRecent calls (duration only — transcripts coming later):");
    i.recentCalls
      .slice(0, 12)
      .forEach((c) =>
        lines.push(
          `- ${fmtDate(c.when)} (${Math.round(c.durationSeconds / 60)}m)`,
        ),
      );
  }

  // Older topic history: thread summaries for threads not already covered
  // above. This is where deep-but-dormant relationships preserve their texture.
  const olderHistory = i.threadHistory.filter(
    (t) => !consumedThreads.has(t.threadId),
  );
  if (olderHistory.length > 0) {
    lines.push(
      `\nOlder topic history (${olderHistory.length} threads, summaries only):`,
    );
    olderHistory.forEach((t) =>
      lines.push(`- ${fmtDate(t.when)} [${t.kind}] ${t.summary}`),
    );
  }

  if (i.recentEvents.length > 0) {
    lines.push("\nCalendar events together:");
    i.recentEvents
      .slice(0, 12)
      .forEach((e) =>
        lines.push(`- ${fmtDate(e.when)} ${e.title ?? "(no title)"}`),
      );
  }

  // Future hook — populated when call transcription ships.
  if (i.callTranscripts.length > 0) {
    lines.push("\nCall transcripts:");
    i.callTranscripts.forEach((t) =>
      lines.push(`- ${fmtDate(t.when)}\n${t.transcript.slice(0, MAX_ITEM_BODY)}`),
    );
  }

  if (
    recentMsgLines.length +
      recentEmailLines.length +
      i.recentCalls.length +
      olderHistory.length +
      i.recentEvents.length ===
    0
  ) {
    lines.push("\n(No diary data linked to this contact yet.)");
  } else if (earliestRawAt && latestRawAt) {
    lines.push(
      `\n(Recent block spans ${fmtDate(earliestRawAt)} → ${fmtDate(
        latestRawAt,
      )}.)`,
    );
  }

  return lines.join("\n");
}

export async function getOrGenerateRelationshipSummary(
  contactId: string,
  inputs: RelationshipInputs,
  opts: { force?: boolean } = {},
): Promise<{
  body: string;
  model: string;
  generatedAt: Date;
  cached: boolean;
} | null> {
  const inputsHash = hashInputs(inputs);

  if (!opts.force) {
    const [existing] = await db
      .select()
      .from(schema.relationshipSummaries)
      .where(
        and(
          eq(schema.relationshipSummaries.contactId, contactId),
          eq(schema.relationshipSummaries.inputsHash, inputsHash),
        ),
      )
      .orderBy(desc(schema.relationshipSummaries.generatedAt))
      .limit(1);
    if (existing) {
      return {
        body: existing.body,
        model: existing.model,
        generatedAt: existing.generatedAt,
        cached: true,
      };
    }
  }

  let result;
  try {
    result = await chat(
      [
        { role: "system", content: SYSTEM_PROMPT_RELATIONSHIP },
        { role: "user", content: renderRelationshipUserMsg(inputs) },
      ],
      { temperature: 0.4, maxTokens: 160 },
    );
  } catch (e) {
    if (e instanceof LLMConfigError) return null;
    throw e;
  }

  const [row] = await db
    .insert(schema.relationshipSummaries)
    .values({
      contactId,
      body: result.text,
      model: result.model,
      inputsHash,
    })
    .returning();
  return {
    body: row.body,
    model: row.model,
    generatedAt: row.generatedAt,
    cached: false,
  };
}

export async function summarizeThread(
  inputs: { transcript: string },
): Promise<string | null> {
  try {
    const r = await chat(
      [
        { role: "system", content: SYSTEM_PROMPT_THREAD },
        { role: "user", content: inputs.transcript.slice(0, 6000) },
      ],
      { temperature: 0.3, maxTokens: 180 },
    );
    return r.text;
  } catch (e) {
    if (e instanceof LLMConfigError) return null;
    throw e;
  }
}
