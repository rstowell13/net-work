import "server-only";
import { and, eq, sql, desc, inArray, isNull, isNotNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { computeFreshness, type FreshnessResult } from "@/lib/scoring/freshness";

export interface ContactListRow {
  id: string;
  displayName: string;
  primaryEmail: string | null;
  primaryPhone: string | null;
  photoUrl: string | null;
  category: "personal" | "business" | "both" | null;
  triageStatus: "to_triage" | "kept" | "skipped";
  lastSeenAt: Date | null;
  freshness: FreshnessResult;
  sources: string[]; // distinct source kinds via raw_contacts
  rawCount: number;
}

export interface ContactListFilters {
  status?: "to_triage" | "kept" | "skipped" | "all";
  category?: "personal" | "business" | "both" | "uncategorized";
  recency?: "0_30" | "30_90" | "90_365" | "365_plus" | null;
}

async function aggregateLastSeen(
  contactIds: string[],
): Promise<Map<string, Date>> {
  if (contactIds.length === 0) return new Map();
  // Pull max(sent_at|started_at) per contact across messages/emails/calls.
  // Three small queries, one merge in JS — clearer than a UNION subquery.
  const out = new Map<string, Date>();
  const update = (id: string | null, when: Date | null) => {
    if (!id || !when) return;
    const cur = out.get(id);
    if (!cur || cur < when) out.set(id, when);
  };

  const m = await db
    .select({
      id: schema.messages.contactId,
      when: sql<Date>`max(${schema.messages.sentAt})`,
    })
    .from(schema.messages)
    .where(inArray(schema.messages.contactId, contactIds))
    .groupBy(schema.messages.contactId);
  for (const r of m) update(r.id, r.when);

  const e = await db
    .select({
      id: schema.emails.contactId,
      when: sql<Date>`max(${schema.emails.sentAt})`,
    })
    .from(schema.emails)
    .where(inArray(schema.emails.contactId, contactIds))
    .groupBy(schema.emails.contactId);
  for (const r of e) update(r.id, r.when);

  const c = await db
    .select({
      id: schema.callLogs.contactId,
      when: sql<Date>`max(${schema.callLogs.startedAt})`,
    })
    .from(schema.callLogs)
    .where(inArray(schema.callLogs.contactId, contactIds))
    .groupBy(schema.callLogs.contactId);
  for (const r of c) update(r.id, r.when);

  return out;
}

async function aggregateSources(
  contactIds: string[],
): Promise<Map<string, { kinds: Set<string>; count: number }>> {
  if (contactIds.length === 0) return new Map();
  const rows = await db
    .select({
      contactId: schema.rawContacts.contactId,
      kind: schema.sources.kind,
    })
    .from(schema.rawContacts)
    .innerJoin(
      schema.sources,
      eq(schema.sources.id, schema.rawContacts.sourceId),
    )
    .where(inArray(schema.rawContacts.contactId, contactIds));
  const out = new Map<string, { kinds: Set<string>; count: number }>();
  for (const r of rows) {
    if (!r.contactId) continue;
    const cur = out.get(r.contactId) ?? { kinds: new Set<string>(), count: 0 };
    cur.kinds.add(r.kind);
    cur.count += 1;
    out.set(r.contactId, cur);
  }
  return out;
}

export async function listContacts(
  userId: string,
  filters: ContactListFilters = {},
  limit = 200,
): Promise<ContactListRow[]> {
  const conds = [eq(schema.contacts.userId, userId), isNull(schema.contacts.deletedAt)];
  if (filters.status && filters.status !== "all") {
    conds.push(eq(schema.contacts.triageStatus, filters.status));
  }
  if (filters.category) {
    if (filters.category === "uncategorized") {
      conds.push(isNull(schema.contacts.category));
    } else {
      conds.push(eq(schema.contacts.category, filters.category));
    }
  }

  const rows = await db
    .select()
    .from(schema.contacts)
    .where(and(...conds))
    .orderBy(desc(schema.contacts.updatedAt))
    .limit(limit);

  const ids = rows.map((r) => r.id);
  const [lastSeen, sources] = await Promise.all([
    aggregateLastSeen(ids),
    aggregateSources(ids),
  ]);

  let result: ContactListRow[] = rows.map((c) => {
    const ls = lastSeen.get(c.id) ?? null;
    const src = sources.get(c.id) ?? { kinds: new Set<string>(), count: 0 };
    return {
      id: c.id,
      displayName: c.displayName,
      primaryEmail: c.primaryEmail,
      primaryPhone: c.primaryPhone,
      photoUrl: c.photoUrl,
      category: c.category,
      triageStatus: c.triageStatus,
      lastSeenAt: ls,
      freshness: computeFreshness(ls),
      sources: [...src.kinds],
      rawCount: src.count,
    };
  });

  if (filters.recency) {
    const days = (d: Date | null) =>
      d ? Math.floor((Date.now() - d.getTime()) / 86400_000) : null;
    result = result.filter((r) => {
      const d = days(r.lastSeenAt);
      if (d === null) return filters.recency === "365_plus";
      switch (filters.recency) {
        case "0_30":
          return d < 30;
        case "30_90":
          return d >= 30 && d < 90;
        case "90_365":
          return d >= 90 && d < 365;
        case "365_plus":
          return d >= 365;
      }
    });
  }
  return result;
}

export async function getStatusCounts(userId: string) {
  const rows = await db
    .select({
      status: schema.contacts.triageStatus,
      n: sql<number>`count(*)::int`,
    })
    .from(schema.contacts)
    .where(
      and(
        eq(schema.contacts.userId, userId),
        isNull(schema.contacts.deletedAt),
      ),
    )
    .groupBy(schema.contacts.triageStatus);
  const out = { to_triage: 0, kept: 0, skipped: 0, all: 0 };
  for (const r of rows) {
    out[r.status] = r.n;
    out.all += r.n;
  }
  return out;
}

export async function getCategoryCounts(userId: string) {
  const rows = await db
    .select({
      category: schema.contacts.category,
      n: sql<number>`count(*)::int`,
    })
    .from(schema.contacts)
    .where(
      and(
        eq(schema.contacts.userId, userId),
        eq(schema.contacts.triageStatus, "kept"),
        isNull(schema.contacts.deletedAt),
      ),
    )
    .groupBy(schema.contacts.category);
  const out = { personal: 0, business: 0, both: 0, uncategorized: 0 };
  for (const r of rows) {
    if (r.category) out[r.category] = r.n;
    else out.uncategorized = r.n;
  }
  return out;
}

export async function getNextTriageContact(userId: string) {
  const [c] = await db
    .select()
    .from(schema.contacts)
    .where(
      and(
        eq(schema.contacts.userId, userId),
        eq(schema.contacts.triageStatus, "to_triage"),
        isNull(schema.contacts.deletedAt),
      ),
    )
    .orderBy(schema.contacts.createdAt)
    .limit(1);
  if (!c) return null;

  const [lastSeen, sources] = await Promise.all([
    aggregateLastSeen([c.id]),
    aggregateSources([c.id]),
  ]);
  const ls = lastSeen.get(c.id) ?? null;
  const src = sources.get(c.id) ?? { kinds: new Set<string>(), count: 0 };

  // Pull a small recent history slice for the card preview.
  const [recentMsgs, recentEmails, recentCalls] = await Promise.all([
    db
      .select({
        id: schema.messages.id,
        sentAt: schema.messages.sentAt,
        body: schema.messages.body,
        channel: schema.messages.channel,
      })
      .from(schema.messages)
      .where(eq(schema.messages.contactId, c.id))
      .orderBy(desc(schema.messages.sentAt))
      .limit(3),
    db
      .select({
        id: schema.emails.id,
        sentAt: schema.emails.sentAt,
        subject: schema.emails.subject,
      })
      .from(schema.emails)
      .where(eq(schema.emails.contactId, c.id))
      .orderBy(desc(schema.emails.sentAt))
      .limit(3),
    db
      .select({
        id: schema.callLogs.id,
        startedAt: schema.callLogs.startedAt,
        durationSeconds: schema.callLogs.durationSeconds,
      })
      .from(schema.callLogs)
      .where(eq(schema.callLogs.contactId, c.id))
      .orderBy(desc(schema.callLogs.startedAt))
      .limit(3),
  ]);

  const counts = {
    threads: await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.messageThreads)
      .where(eq(schema.messageThreads.contactId, c.id))
      .then((r) => r[0]?.n ?? 0),
    calls: recentCalls.length, // approximation if there are >3
    emails: recentEmails.length,
  };

  return {
    contact: c,
    lastSeenAt: ls,
    freshness: computeFreshness(ls),
    sources: [...src.kinds],
    recent: {
      messages: recentMsgs,
      emails: recentEmails,
      calls: recentCalls,
    },
    counts,
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _unused = isNotNull;
