import "server-only";
import { and, eq, gte, sql, desc, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { computeFreshness, type FreshnessResult } from "@/lib/scoring/freshness";
import { aggregateTags, type Tag } from "@/lib/tags/queries";
import { getTriageRules } from "@/lib/triage/rules";
import { qualifiesForTriage } from "@/lib/triage/eligibility";

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
  tags: Tag[];
}

export interface ContactListFilters {
  status?: "to_triage" | "kept" | "skipped" | "all";
  category?: "personal" | "business" | "both" | "uncategorized";
  recency?: "0_30" | "30_90" | "90_365" | "365_plus" | null;
  tags?: string[]; // tag IDs; matches contacts carrying ANY of them (OR)
}

async function aggregateLastSeen(
  contactIds: string[],
): Promise<Map<string, Date>> {
  if (contactIds.length === 0) return new Map();
  // Pull max(sent_at|started_at) per contact across messages/emails/calls.
  // Three small queries, one merge in JS — clearer than a UNION subquery.
  const out = new Map<string, Date>();
  // postgres-js returns max(timestamp) as a string from aggregate queries;
  // coerce to Date so callers can use .getTime().
  const update = (id: string | null, when: Date | string | null) => {
    if (!id || !when) return;
    const date = when instanceof Date ? when : new Date(when);
    const cur = out.get(id);
    if (!cur || cur < date) out.set(id, date);
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

async function aggregateInteractions365(
  contactIds: string[],
): Promise<Map<string, number>> {
  if (contactIds.length === 0) return new Map();
  const cutoff = new Date(Date.now() - 365 * 86400_000);
  const out = new Map<string, number>();
  const bump = (id: string | null, n: number) => {
    if (!id) return;
    out.set(id, (out.get(id) ?? 0) + n);
  };

  const m = await db
    .select({
      id: schema.messages.contactId,
      n: sql<number>`count(*)::int`,
    })
    .from(schema.messages)
    .where(
      and(
        inArray(schema.messages.contactId, contactIds),
        gte(schema.messages.sentAt, cutoff),
      ),
    )
    .groupBy(schema.messages.contactId);
  for (const r of m) bump(r.id, r.n);

  const e = await db
    .select({
      id: schema.emails.contactId,
      n: sql<number>`count(*)::int`,
    })
    .from(schema.emails)
    .where(
      and(
        inArray(schema.emails.contactId, contactIds),
        gte(schema.emails.sentAt, cutoff),
      ),
    )
    .groupBy(schema.emails.contactId);
  for (const r of e) bump(r.id, r.n);

  const c = await db
    .select({
      id: schema.callLogs.contactId,
      n: sql<number>`count(*)::int`,
    })
    .from(schema.callLogs)
    .where(
      and(
        inArray(schema.callLogs.contactId, contactIds),
        gte(schema.callLogs.startedAt, cutoff),
      ),
    )
    .groupBy(schema.callLogs.contactId);
  for (const r of c) bump(r.id, r.n);

  return out;
}

/**
 * Freshness (lastSeenAt + score) for an explicit set of contact ids —
 * for callers (e.g. the home page) that already know which contacts they
 * care about and don't need the full listContacts hydration (sources, tags,
 * full contact row) for the other ~2000 contacts that aren't in view.
 */
export async function getFreshnessForContactIds(
  contactIds: string[],
): Promise<Map<string, { lastSeenAt: Date | null; freshness: FreshnessResult }>> {
  const out = new Map<string, { lastSeenAt: Date | null; freshness: FreshnessResult }>();
  if (contactIds.length === 0) return out;
  const [lastSeen, freq] = await Promise.all([
    aggregateLastSeen(contactIds),
    aggregateInteractions365(contactIds),
  ]);
  for (const id of contactIds) {
    const ls = lastSeen.get(id) ?? null;
    out.set(id, {
      lastSeenAt: ls,
      freshness: computeFreshness({
        lastSeenAt: ls,
        interactions365: freq.get(id) ?? 0,
      }),
    });
  }
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

async function aggregateDirectional(
  contactIds: string[],
): Promise<Map<string, { inbound: number; outbound: number }>> {
  if (contactIds.length === 0) return new Map();
  // Inbound vs outbound counts across personal channels, used to gate the
  // triage queue on two-way engagement. Group texts are excluded (a group
  // blast isn't a 1-on-1 exchange); missed calls are excluded (no engagement).
  const out = new Map<string, { inbound: number; outbound: number }>();
  const bump = (id: string | null, dir: string, n: number) => {
    if (!id) return;
    const cur = out.get(id) ?? { inbound: 0, outbound: 0 };
    if (dir === "inbound") cur.inbound += n;
    else if (dir === "outbound") cur.outbound += n;
    out.set(id, cur);
  };

  const m = await db
    .select({
      id: schema.messages.contactId,
      direction: schema.messages.direction,
      n: sql<number>`count(*)::int`,
    })
    .from(schema.messages)
    .where(
      and(
        inArray(schema.messages.contactId, contactIds),
        eq(schema.messages.isGroup, false),
      ),
    )
    .groupBy(schema.messages.contactId, schema.messages.direction);
  for (const r of m) bump(r.id, r.direction, r.n);

  const e = await db
    .select({
      id: schema.emails.contactId,
      direction: schema.emails.direction,
      n: sql<number>`count(*)::int`,
    })
    .from(schema.emails)
    .where(inArray(schema.emails.contactId, contactIds))
    .groupBy(schema.emails.contactId, schema.emails.direction);
  for (const r of e) bump(r.id, r.direction, r.n);

  const c = await db
    .select({
      id: schema.callLogs.contactId,
      direction: schema.callLogs.direction,
      n: sql<number>`count(*)::int`,
    })
    .from(schema.callLogs)
    .where(inArray(schema.callLogs.contactId, contactIds))
    .groupBy(schema.callLogs.contactId, schema.callLogs.direction);
  for (const r of c) bump(r.id, r.direction, r.n);

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
  if (filters.tags && filters.tags.length > 0) {
    // Contacts carrying ANY of the selected tags (OR). Resolve matching ids
    // up front, then constrain the main query — consistent with the JS-merge
    // style used elsewhere in this module.
    const tagged = await db
      .select({ contactId: schema.contactTags.contactId })
      .from(schema.contactTags)
      .where(inArray(schema.contactTags.tagId, filters.tags));
    const taggedIds = [...new Set(tagged.map((r) => r.contactId))];
    if (taggedIds.length === 0) return [];
    conds.push(inArray(schema.contacts.id, taggedIds));
  }

  let rows: (typeof schema.contacts.$inferSelect)[];

  if (filters.recency) {
    // The recency threshold depends on lastSeenAt, which is computed from
    // aggregates, not a column we can push into this WHERE. Filtering after
    // the LIMIT would silently drop qualifying contacts past the first page
    // (a correctness bug, not just a perf one), so instead: pull every
    // matching id (cheap — id + updatedAt only), compute lastSeen for the
    // whole candidate set, filter by recency, THEN take the top `limit` by
    // updatedAt and hydrate full rows + the remaining aggregates only for
    // that final page.
    const candidates = await db
      .select({ id: schema.contacts.id, updatedAt: schema.contacts.updatedAt })
      .from(schema.contacts)
      .where(and(...conds))
      .orderBy(desc(schema.contacts.updatedAt));

    const candidateIds = candidates.map((c) => c.id);
    const lastSeenAll = await aggregateLastSeen(candidateIds);
    const days = (d: Date | null) =>
      d ? Math.floor((Date.now() - d.getTime()) / 86400_000) : null;
    const matchesRecency = (d: number | null) => {
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
        default:
          return true;
      }
    };
    const keptIds = candidates
      .filter((c) => matchesRecency(days(lastSeenAll.get(c.id) ?? null)))
      .slice(0, limit)
      .map((c) => c.id);
    if (keptIds.length === 0) return [];

    rows = await db
      .select()
      .from(schema.contacts)
      .where(inArray(schema.contacts.id, keptIds))
      .orderBy(desc(schema.contacts.updatedAt));

    const ids = rows.map((r) => r.id);
    const [sources, freq, tags] = await Promise.all([
      aggregateSources(ids),
      aggregateInteractions365(ids),
      aggregateTags(ids),
    ]);
    return rows.map((c) => {
      const ls = lastSeenAll.get(c.id) ?? null;
      const src = sources.get(c.id) ?? { kinds: new Set<string>(), count: 0 };
      const interactions = freq.get(c.id) ?? 0;
      return {
        id: c.id,
        displayName: c.displayName,
        primaryEmail: c.primaryEmail,
        primaryPhone: c.primaryPhone,
        photoUrl: c.photoUrl,
        category: c.category,
        triageStatus: c.triageStatus,
        lastSeenAt: ls,
        freshness: computeFreshness({
          lastSeenAt: ls,
          interactions365: interactions,
        }),
        sources: [...src.kinds],
        rawCount: src.count,
        tags: tags.get(c.id) ?? [],
      };
    });
  }

  rows = await db
    .select()
    .from(schema.contacts)
    .where(and(...conds))
    .orderBy(desc(schema.contacts.updatedAt))
    .limit(limit);

  const ids = rows.map((r) => r.id);
  const [lastSeen, sources, freq, tags] = await Promise.all([
    aggregateLastSeen(ids),
    aggregateSources(ids),
    aggregateInteractions365(ids),
    aggregateTags(ids),
  ]);

  return rows.map((c) => {
    const ls = lastSeen.get(c.id) ?? null;
    const src = sources.get(c.id) ?? { kinds: new Set<string>(), count: 0 };
    const interactions = freq.get(c.id) ?? 0;
    return {
      id: c.id,
      displayName: c.displayName,
      primaryEmail: c.primaryEmail,
      primaryPhone: c.primaryPhone,
      photoUrl: c.photoUrl,
      category: c.category,
      triageStatus: c.triageStatus,
      lastSeenAt: ls,
      freshness: computeFreshness({
        lastSeenAt: ls,
        interactions365: interactions,
      }),
      sources: [...src.kinds],
      rawCount: src.count,
      tags: tags.get(c.id) ?? [],
    };
  });
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

export interface TriageQueueResult {
  next: {
    contact: typeof schema.contacts.$inferSelect;
    lastSeenAt: Date | null;
    freshness: FreshnessResult;
    sources: string[];
    recent: {
      messages: { id: string; sentAt: Date; body: string | null }[];
      emails: { id: string; sentAt: Date; subject: string | null }[];
      calls: { id: string; startedAt: Date; durationSeconds: number }[];
      calendar: { id: string; startsAt: Date; title: string }[];
    };
    counts: { threads: number; calls: number; emails: number };
  } | null;
  // Qualifying contacts still awaiting a decision, and those hidden by the
  // strictness filter. Drive the progress bar and empty state from these.
  eligibleRemaining: number;
  hiddenCount: number;
}

export async function getNextTriageContact(
  userId: string,
): Promise<TriageQueueResult> {
  const rules = await getTriageRules(userId);

  // Whole to_triage set (ids + createdAt tie-breaker only — cheap).
  const queue = await db
    .select({
      id: schema.contacts.id,
      createdAt: schema.contacts.createdAt,
    })
    .from(schema.contacts)
    .where(
      and(
        eq(schema.contacts.userId, userId),
        eq(schema.contacts.triageStatus, "to_triage"),
        isNull(schema.contacts.deletedAt),
      ),
    );
  if (queue.length === 0) {
    return { next: null, eligibleRemaining: 0, hiddenCount: 0 };
  }

  const ids = queue.map((q) => q.id);
  const [directional, lastSeenAll, freqAll] = await Promise.all([
    aggregateDirectional(ids),
    aggregateLastSeen(ids),
    aggregateInteractions365(ids),
  ]);
  const now = new Date();

  // Filter to qualifying contacts, then rank by freshness (recency + volume),
  // tie-broken by total interactions, then oldest-created first.
  const ranked = queue
    .map((q) => {
      const d = directional.get(q.id) ?? { inbound: 0, outbound: 0 };
      const ls = lastSeenAll.get(q.id) ?? null;
      const total = d.inbound + d.outbound;
      const eligible = qualifiesForTriage(
        { inbound: d.inbound, outbound: d.outbound, total, lastSeenAt: ls },
        rules,
        now,
      );
      const freshness = computeFreshness(
        { lastSeenAt: ls, interactions365: freqAll.get(q.id) ?? 0 },
        now,
      );
      return { id: q.id, createdAt: q.createdAt, eligible, total, freshness };
    })
    .filter((r) => r.eligible);

  ranked.sort((a, b) => {
    if (b.freshness.score !== a.freshness.score) {
      return b.freshness.score - a.freshness.score;
    }
    if (b.total !== a.total) return b.total - a.total;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  const eligibleRemaining = ranked.length;
  const hiddenCount = queue.length - eligibleRemaining;
  if (eligibleRemaining === 0) {
    return { next: null, eligibleRemaining, hiddenCount };
  }

  const top = ranked[0];
  const [c] = await db
    .select()
    .from(schema.contacts)
    .where(eq(schema.contacts.id, top.id))
    .limit(1);
  if (!c) {
    return { next: null, eligibleRemaining, hiddenCount };
  }

  const sources = await aggregateSources([c.id]);
  const ls = lastSeenAll.get(c.id) ?? null;
  const src = sources.get(c.id) ?? { kinds: new Set<string>(), count: 0 };

  // Pull a small recent history slice for the card preview.
  const [recentMsgs, recentEmails, recentCalls, recentCalendar] =
    await Promise.all([
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
    db
      .select({
        id: schema.calendarEvents.id,
        startsAt: schema.calendarEvents.startsAt,
        title: schema.calendarEvents.title,
      })
      .from(schema.calendarEvents)
      .where(eq(schema.calendarEvents.contactId, c.id))
      .orderBy(desc(schema.calendarEvents.startsAt))
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
    next: {
      contact: c,
      lastSeenAt: ls,
      freshness: top.freshness,
      sources: [...src.kinds],
      recent: {
        messages: recentMsgs,
        emails: recentEmails,
        calls: recentCalls,
        calendar: recentCalendar,
      },
      counts,
    },
    eligibleRemaining,
    hiddenCount,
  };
}
