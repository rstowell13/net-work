import "server-only";
import { and, asc, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { recencyDecay } from "@/lib/scoring/freshness";
import { escapeLike, makeSnippet } from "./text";

export { escapeLike, makeSnippet } from "./text";

/**
 * Global search across People, Tags, and Mentions (conversation/note content).
 *
 * - People / Tags: substring (ILIKE) over short, high-signal fields — exactly
 *   what "type Brian, find Brian" needs.
 * - Mentions: Postgres full-text (to_tsvector @@ websearch_to_tsquery) over the
 *   long body/summary fields, so a topic word matches stems ("invest" →
 *   "investing") and multi-word queries ("real estate") match both words
 *   anywhere. The AI-written summary fields are weighted highest because they
 *   distil what a conversation was about.
 *
 * The full-text predicate is computed inline, so search is fully correct
 * without any migration. db/migrations/0005_search_indexes.sql adds matching
 * expression GIN indexes purely for speed (apply once, manually).
 *
 * Everything is scoped to the owner: contacts/tags via userId directly;
 * conversation tables (which carry no userId) via an inner join to contacts.
 * Soft-deleted rows (deletedAt) are always excluded.
 */

export interface SearchContactHit {
  id: string;
  displayName: string;
  primaryEmail: string | null;
  primaryPhone: string | null;
  photoUrl: string | null;
  category: "personal" | "business" | "both" | null;
  matchedOn: "name" | "email" | "phone";
}

export interface SearchTagHit {
  id: string;
  name: string;
  color: string | null;
  contactCount: number;
}

export type MentionSource = "note" | "email" | "message" | "summary" | "event";

export interface SearchMentionHit {
  contactId: string;
  displayName: string;
  photoUrl: string | null;
  source: MentionSource;
  snippet: string;
  matchCount: number;
}

export interface SearchResults {
  contacts: SearchContactHit[];
  tags: SearchTagHit[];
  mentions: SearchMentionHit[];
}

export interface SearchLimits {
  contacts?: number;
  tags?: number;
  mentions?: number;
}

const DEFAULT_LIMITS: Required<SearchLimits> = {
  contacts: 5,
  tags: 5,
  mentions: 5,
};

/**
 * Relative weight of each mention source. Summaries (AI "what was this about")
 * float to the top, then user-written notes, then raw conversation, then
 * calendar titles. The user chose "everything, summaries ranked first".
 */
const SOURCE_WEIGHT: Record<MentionSource, number> = {
  summary: 5,
  note: 4,
  email: 2,
  message: 2,
  event: 1,
};

function recencyFactor(when: Date | string | null): number {
  if (!when) return 0.5;
  const t = when instanceof Date ? when.getTime() : new Date(when).getTime();
  if (Number.isNaN(t)) return 0.5;
  const days = Math.max(0, (Date.now() - t) / 86400_000);
  return recencyDecay(days);
}

/** A full-text match predicate over a text expression against the query `q`. */
function ftsMatch(expr: ReturnType<typeof sql>, q: string) {
  return sql`${expr} @@ websearch_to_tsquery('english', ${q})`;
}

interface MentionCandidate {
  contactId: string;
  displayName: string;
  photoUrl: string | null;
  source: MentionSource;
  text: string;
  when: Date | string | null;
}

export async function searchAll(
  userId: string,
  rawQuery: string,
  limits: SearchLimits = {},
): Promise<SearchResults> {
  const q = rawQuery.trim();
  const lim = { ...DEFAULT_LIMITS, ...limits };
  if (q.length < 2) return { contacts: [], tags: [], mentions: [] };

  const pat = `%${escapeLike(q)}%`;
  const candPer = Math.min(60, Math.max(lim.mentions * 4, 12));

  const [contactRows, tagRows, ...mentionGroups] = await Promise.all([
    searchContacts(userId, pat),
    searchTags(userId, pat, lim.tags),
    ...mentionQueries(userId, q, candPer),
  ]);

  return {
    contacts: rankContacts(contactRows, q, lim.contacts),
    tags: tagRows,
    mentions: rankMentions(mentionGroups.flat(), q, lim.mentions),
  };
}

// ── People ────────────────────────────────────────────────────────────────

interface ContactRow {
  id: string;
  displayName: string;
  primaryEmail: string | null;
  primaryPhone: string | null;
  photoUrl: string | null;
  category: "personal" | "business" | "both" | null;
}

function searchContacts(userId: string, pat: string): Promise<ContactRow[]> {
  return db
    .select({
      id: schema.contacts.id,
      displayName: schema.contacts.displayName,
      primaryEmail: schema.contacts.primaryEmail,
      primaryPhone: schema.contacts.primaryPhone,
      photoUrl: schema.contacts.photoUrl,
      category: schema.contacts.category,
    })
    .from(schema.contacts)
    .where(
      and(
        eq(schema.contacts.userId, userId),
        isNull(schema.contacts.deletedAt),
        or(
          ilike(schema.contacts.displayName, pat),
          ilike(schema.contacts.primaryEmail, pat),
          ilike(schema.contacts.primaryPhone, pat),
        ),
      ),
    )
    .limit(50);
}

function rankContacts(
  rows: ContactRow[],
  q: string,
  limit: number,
): SearchContactHit[] {
  const ql = q.toLowerCase();
  const scored = rows.map((r) => {
    const name = (r.displayName ?? "").toLowerCase();
    let tier: number;
    let matchedOn: SearchContactHit["matchedOn"];
    if (name === ql) {
      tier = 100;
      matchedOn = "name";
    } else if (name.startsWith(ql)) {
      tier = 80;
      matchedOn = "name";
    } else if (name.includes(ql)) {
      tier = 60;
      matchedOn = "name";
    } else if ((r.primaryEmail ?? "").toLowerCase().includes(ql)) {
      tier = 40;
      matchedOn = "email";
    } else {
      tier = 30;
      matchedOn = "phone";
    }
    return { r, matchedOn, sort: tier };
  });
  scored.sort((a, b) => b.sort - a.sort);
  return scored.slice(0, limit).map(({ r, matchedOn }) => ({
    id: r.id,
    displayName: r.displayName,
    primaryEmail: r.primaryEmail,
    primaryPhone: r.primaryPhone,
    photoUrl: r.photoUrl,
    category: r.category,
    matchedOn,
  }));
}

// ── Tags ────────────────────────────────────────────────────────────────────

function searchTags(
  userId: string,
  pat: string,
  limit: number,
): Promise<SearchTagHit[]> {
  return db
    .select({
      id: schema.tags.id,
      name: schema.tags.name,
      color: schema.tags.color,
      contactCount: sql<number>`count(distinct ${schema.contacts.id})::int`,
    })
    .from(schema.tags)
    .leftJoin(schema.contactTags, eq(schema.contactTags.tagId, schema.tags.id))
    .leftJoin(
      schema.contacts,
      and(
        eq(schema.contacts.id, schema.contactTags.contactId),
        isNull(schema.contacts.deletedAt),
      ),
    )
    .where(
      and(
        eq(schema.tags.userId, userId),
        isNull(schema.tags.deletedAt),
        ilike(schema.tags.name, pat),
      ),
    )
    .groupBy(schema.tags.id)
    .orderBy(asc(schema.tags.name))
    .limit(limit);
}

// ── Mentions (full-text over conversation/note content) ─────────────────────

function mentionQueries(
  userId: string,
  q: string,
  candPer: number,
): Promise<MentionCandidate[]>[] {
  const scopedToOwner = isNull(schema.contacts.deletedAt);

  // notes.body
  const notes = db
    .select({
      contactId: schema.notes.contactId,
      displayName: schema.contacts.displayName,
      photoUrl: schema.contacts.photoUrl,
      text: schema.notes.body,
      when: schema.notes.createdAt,
    })
    .from(schema.notes)
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.notes.contactId))
    .where(
      and(
        eq(schema.contacts.userId, userId),
        scopedToOwner,
        isNull(schema.notes.deletedAt),
        ftsMatch(sql`to_tsvector('english', coalesce(${schema.notes.body}, ''))`, q),
      ),
    )
    .orderBy(desc(schema.notes.createdAt))
    .limit(candPer)
    .then((rows) => rows.map((r) => ({ ...r, source: "note" as const })));

  // emails.subject + body
  const emails = db
    .select({
      contactId: schema.emails.contactId,
      displayName: schema.contacts.displayName,
      photoUrl: schema.contacts.photoUrl,
      subject: schema.emails.subject,
      body: schema.emails.body,
      when: schema.emails.sentAt,
    })
    .from(schema.emails)
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.emails.contactId))
    .where(
      and(
        eq(schema.contacts.userId, userId),
        scopedToOwner,
        ftsMatch(
          sql`to_tsvector('english', coalesce(${schema.emails.subject}, '') || ' ' || coalesce(${schema.emails.body}, ''))`,
          q,
        ),
      ),
    )
    .orderBy(desc(schema.emails.sentAt))
    .limit(candPer)
    .then((rows) =>
      rows.map((r) => ({
        contactId: r.contactId,
        displayName: r.displayName,
        photoUrl: r.photoUrl,
        text: [r.subject, r.body].filter(Boolean).join(" — "),
        when: r.when,
        source: "email" as const,
      })),
    );

  // messages.body
  const messages = db
    .select({
      contactId: schema.messages.contactId,
      displayName: schema.contacts.displayName,
      photoUrl: schema.contacts.photoUrl,
      text: schema.messages.body,
      when: schema.messages.sentAt,
    })
    .from(schema.messages)
    .innerJoin(
      schema.contacts,
      eq(schema.contacts.id, schema.messages.contactId),
    )
    .where(
      and(
        eq(schema.contacts.userId, userId),
        scopedToOwner,
        ftsMatch(
          sql`to_tsvector('english', coalesce(${schema.messages.body}, ''))`,
          q,
        ),
      ),
    )
    .orderBy(desc(schema.messages.sentAt))
    .limit(candPer)
    .then((rows) => rows.map((r) => ({ ...r, source: "message" as const })));

  // email_threads.summary (AI)
  const emailSummaries = db
    .select({
      contactId: schema.emailThreads.contactId,
      displayName: schema.contacts.displayName,
      photoUrl: schema.contacts.photoUrl,
      text: schema.emailThreads.summary,
      when: schema.emailThreads.endedAt,
    })
    .from(schema.emailThreads)
    .innerJoin(
      schema.contacts,
      eq(schema.contacts.id, schema.emailThreads.contactId),
    )
    .where(
      and(
        eq(schema.contacts.userId, userId),
        scopedToOwner,
        ftsMatch(
          sql`to_tsvector('english', coalesce(${schema.emailThreads.summary}, ''))`,
          q,
        ),
      ),
    )
    .orderBy(desc(schema.emailThreads.endedAt))
    .limit(candPer)
    .then((rows) => rows.map((r) => ({ ...r, source: "summary" as const })));

  // message_threads.summary (AI)
  const messageSummaries = db
    .select({
      contactId: schema.messageThreads.contactId,
      displayName: schema.contacts.displayName,
      photoUrl: schema.contacts.photoUrl,
      text: schema.messageThreads.summary,
      when: schema.messageThreads.endedAt,
    })
    .from(schema.messageThreads)
    .innerJoin(
      schema.contacts,
      eq(schema.contacts.id, schema.messageThreads.contactId),
    )
    .where(
      and(
        eq(schema.contacts.userId, userId),
        scopedToOwner,
        ftsMatch(
          sql`to_tsvector('english', coalesce(${schema.messageThreads.summary}, ''))`,
          q,
        ),
      ),
    )
    .orderBy(desc(schema.messageThreads.endedAt))
    .limit(candPer)
    .then((rows) => rows.map((r) => ({ ...r, source: "summary" as const })));

  // relationship_summaries.body (AI)
  const relSummaries = db
    .select({
      contactId: schema.relationshipSummaries.contactId,
      displayName: schema.contacts.displayName,
      photoUrl: schema.contacts.photoUrl,
      text: schema.relationshipSummaries.body,
      when: schema.relationshipSummaries.generatedAt,
    })
    .from(schema.relationshipSummaries)
    .innerJoin(
      schema.contacts,
      eq(schema.contacts.id, schema.relationshipSummaries.contactId),
    )
    .where(
      and(
        eq(schema.contacts.userId, userId),
        scopedToOwner,
        ftsMatch(
          sql`to_tsvector('english', coalesce(${schema.relationshipSummaries.body}, ''))`,
          q,
        ),
      ),
    )
    .orderBy(desc(schema.relationshipSummaries.generatedAt))
    .limit(candPer)
    .then((rows) => rows.map((r) => ({ ...r, source: "summary" as const })));

  // calendar_events.title + attendees
  const events = db
    .select({
      contactId: schema.calendarEvents.contactId,
      displayName: schema.contacts.displayName,
      photoUrl: schema.contacts.photoUrl,
      text: schema.calendarEvents.title,
      when: schema.calendarEvents.startsAt,
    })
    .from(schema.calendarEvents)
    .innerJoin(
      schema.contacts,
      eq(schema.contacts.id, schema.calendarEvents.contactId),
    )
    .where(
      and(
        eq(schema.contacts.userId, userId),
        scopedToOwner,
        ftsMatch(
          sql`to_tsvector('english', coalesce(${schema.calendarEvents.title}, '') || ' ' || coalesce(array_to_string(${schema.calendarEvents.attendees}, ' '), ''))`,
          q,
        ),
      ),
    )
    .orderBy(desc(schema.calendarEvents.startsAt))
    .limit(candPer)
    .then((rows) => rows.map((r) => ({ ...r, source: "event" as const })));

  return [
    notes,
    emails,
    messages,
    emailSummaries,
    messageSummaries,
    relSummaries,
    events,
  ] as Promise<MentionCandidate[]>[];
}

function rankMentions(
  candidates: MentionCandidate[],
  q: string,
  limit: number,
): SearchMentionHit[] {
  // Collapse to one row per contact, keeping their single best-scoring hit.
  const best = new Map<
    string,
    { cand: MentionCandidate; score: number; count: number }
  >();
  for (const cand of candidates) {
    if (!cand.contactId || !cand.text) continue;
    const score = SOURCE_WEIGHT[cand.source] * (0.5 + 0.5 * recencyFactor(cand.when));
    const prev = best.get(cand.contactId);
    if (!prev) {
      best.set(cand.contactId, { cand, score, count: 1 });
    } else {
      prev.count += 1;
      if (score > prev.score) {
        prev.cand = cand;
        prev.score = score;
      }
    }
  }
  return [...best.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ cand, count }) => ({
      contactId: cand.contactId,
      displayName: cand.displayName,
      photoUrl: cand.photoUrl,
      source: cand.source,
      snippet: makeSnippet(cand.text, q),
      matchCount: count,
    }));
}
