import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { chat, LLMConfigError } from "./client";

const SYSTEM_PROMPT_RELATIONSHIP = [
  "You are summarizing a relationship for the person who maintains the contact.",
  "Voice: factual, warm, second-person ('you'). Don't editorialize, don't speculate, don't moralize.",
  "Length: one short paragraph (3–5 sentences). No bullets, no headers.",
  "If the data is sparse, say so plainly in one sentence rather than padding.",
].join(" ");

const SYSTEM_PROMPT_THREAD = [
  "Summarize this thread of messages between the user and the contact in 2–3 sentences.",
  "Voice: factual, second-person, no editorializing.",
  "Capture: what was discussed, any open questions, who spoke last.",
].join(" ");

export interface RelationshipInputs {
  contactName: string;
  category: string | null;
  notes: string[];
  recentMessages: Array<{ when: Date; direction: string; body: string | null }>;
  recentEmails: Array<{ when: Date; direction: string; subject: string | null }>;
  recentCalls: Array<{ when: Date; durationSeconds: number }>;
  recentEvents: Array<{ when: Date; title: string | null }>;
}

function hashInputs(inputs: RelationshipInputs): string {
  return createHash("sha1")
    .update(JSON.stringify(inputs))
    .digest("hex")
    .slice(0, 16);
}

function renderRelationshipUserMsg(i: RelationshipInputs): string {
  const lines: string[] = [];
  lines.push(`Contact: ${i.contactName}${i.category ? ` (${i.category})` : ""}`);
  if (i.notes.length > 0) {
    lines.push("\nNotes you've written:");
    i.notes.slice(0, 5).forEach((n) => lines.push(`- ${n}`));
  }
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  if (i.recentMessages.length > 0) {
    lines.push("\nRecent messages:");
    i.recentMessages.slice(0, 12).forEach((m) =>
      lines.push(
        `- ${fmt(m.when)} (${m.direction}) ${
          (m.body ?? "").slice(0, 200) || "(empty)"
        }`,
      ),
    );
  }
  if (i.recentEmails.length > 0) {
    lines.push("\nRecent emails:");
    i.recentEmails.slice(0, 8).forEach((e) =>
      lines.push(
        `- ${fmt(e.when)} (${e.direction}) ${e.subject ?? "(no subject)"}`,
      ),
    );
  }
  if (i.recentCalls.length > 0) {
    lines.push("\nRecent calls:");
    i.recentCalls.slice(0, 6).forEach((c) =>
      lines.push(
        `- ${fmt(c.when)} (${Math.round(c.durationSeconds / 60)}m)`,
      ),
    );
  }
  if (i.recentEvents.length > 0) {
    lines.push("\nRecent calendar events together:");
    i.recentEvents
      .slice(0, 6)
      .forEach((e) => lines.push(`- ${fmt(e.when)} ${e.title ?? "(no title)"}`));
  }
  if (
    i.recentMessages.length +
      i.recentEmails.length +
      i.recentCalls.length +
      i.recentEvents.length ===
    0
  ) {
    lines.push("\n(No diary data linked to this contact yet.)");
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
      { temperature: 0.4, maxTokens: 500 },
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
      { temperature: 0.3, maxTokens: 200 },
    );
    return r.text;
  } catch (e) {
    if (e instanceof LLMConfigError) return null;
    throw e;
  }
}
