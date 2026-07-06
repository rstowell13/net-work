import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { chat, LLMConfigError } from "./client";
import { fmtDate } from "@/lib/format-time";

const SYSTEM_PROMPT_RELATIONSHIP = [
  "TASK: Write 150–300 characters about this specific person — who they are to the user, what shared context the two of you have, and what the relationship has been about. Output the text only; no preface, no greeting, no headers.",
  "VOICE: A thoughtful mutual friend describing this person to someone who already knows them. Specific, observational, slightly dry. Mix of personal-texture and fact-forward dossier. Never categorical.",
  "MAXIMUM SPECIFICITY: Use names and details that appear in the data — kid names, business names, jobs, cities, schools, sports teams, shared trips, specific recurring threads, concrete decisions. Generic categories ('personal contact', 'friend', 'professional contact') are the enemy. If the data names a kid, name the kid. If the data shows a business venture, name the business. If you only know vague themes, lean toward fewer concrete details rather than padding with generic filler.",
  "STRUCTURE (preferred but flexible): Sentence 1 leads with a distinctive identifier — how the user actually knows this person, or the most defining feature of the relationship (e.g. 'Your old mission companion from Cebu' / 'Brig from your Sigma Chi pledge class' / 'Brian — fantasy football co-commissioner and your fastest sports back-channel'). Sentence 2 (optional) adds current-state texture or a recent thread (e.g. 'Lately the conversation has been about Denim's flag football team and Indian Wells trip planning.').",
  "BANNED OPENERS (do not start with any of these, ever):",
  "  • 'A personal contact ___'",
  "  • 'A friend and ___ texter / texting partner'",
  "  • 'An occasional texter ___'",
  "  • 'A frequent texting partner ___'",
  "  • 'A close friend with whom you ___'",
  "  • 'You have a ___ relationship with ___'",
  "BANNED PHRASES (do not include anywhere): 'discussing', 'discussed', 'exchanging', 'topics like', 'topics include', 'in a ___ manner', 'in a ___ way', 'with a ___ tone', 'suggests', 'indicating', 'reflecting', 'with a focus on', 'back-and-forth', 'warm and ___ touch', 'warm and ___ connection', 'frequent communication', 'occasional touch', 'familiar tone'.",
  "RULES OF SUBSTITUTION when tempted to use a banned word: 'discussing X, Y, Z' → '— X, Y, Z' or ': X, Y, Z'; 'with a focus on family' → 'mostly family stuff'; 'in a casual manner' → 'casual'; 'warm and frequent connection' → just delete it and add a specific detail instead.",
  "INPUT FORMAT: Recent conversation appears in full; older history appears as one-line topic tags per thread. Both are equally valid signal. For a long-dormant relationship, the older topic tags ARE the substance — use them to characterize what the relationship used to be about and lead with what was distinctive.",
  "FALLBACK: If the data is genuinely sparse (one or two messages with no substance), output exactly: 'Not enough interaction yet to characterize this relationship.' and stop. Do NOT pad with generic filler.",
  "GOOD examples — note: each leads with a distinctive identifier, names specifics, no categorical opener:",
  "  • 'Your mission companion from Cebu. Works in nuclear power now — last real thread was a possible joint business venture in renewables you discussed but never moved on. Stays in light touch around family and mission reunions.'",
  "  • 'Brian — fantasy football co-commissioner and your fastest sports back-channel. Lately the conversation has been Denim's flag football coach, the baseball playoffs forcing the Indian Wells trip earlier, and Marcus Smart trade rumors.'",
  "  • 'College roommate. Real estate in Austin, two daughters in middle school. Quarterly check-ins, mostly travel logistics and kids — last substantive thread was a Park City trip you discussed but didn't book.'",
  "  • 'Brig — old Sigma Chi brother. Career-coaching back-channel: kids, side hustles, the e-commerce gig he was thinking about taking when he was still at Nuvi. Has gone dormant.'",
  "BAD examples — DO NOT MIRROR THESE; they are exactly the failure mode:",
  "  • 'A personal contact and occasional texter: breakfast spots, travel, and family updates.' ← banned opener + generic category + topic-tag list",
  "  • 'A close friend and frequent texting partner — careers, kids, and business ventures.' ← banned opener + no specifics",
  "  • 'A friend from your Cebu mission days, with a warm and occasional touch, discussing nuclear power ventures.' ← banned phrases 'warm and ___ touch' and 'discussing'",
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
