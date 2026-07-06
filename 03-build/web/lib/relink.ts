/**
 * Post-merge relink: walk a contact's raw_contacts, harvest their phones+
 * emails, and stamp contact_id onto the diary tables (messages, message_
 * threads, emails, email_threads, call_logs, calendar_events) where the
 * handle / from_email / attendee matches.
 *
 * Ingestion writes diary rows with NULL contact_id because Contact rows
 * don't exist yet at ingest time. This runs after merge/apply.
 */
import "server-only";
import { and, arrayOverlaps, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { normalizePhoneHandle } from "@/lib/handles";
import {
  buildHandleMaps,
  matchAttendees,
  matchCallHandle,
  matchEmailRow,
  matchThreadHandle,
} from "@/lib/relink-match";

// Phone normalization for handle matching — shared with the ingest route and
// diary so a group thread's participant roster matches contacts identically.
// See lib/handles.ts for the rationale (last-10-digits collapse).
const normalizePhone = normalizePhoneHandle;

export interface RelinkResult {
  contactId: string;
  messageThreads: number;
  messages: number;
  emailThreads: number;
  emails: number;
  callLogs: number;
  calendarEvents: number;
}

/**
 * The user's own email addresses. These must NEVER be used as a match key when
 * linking email correspondence to a contact — the user's address appears in the
 * From/To of nearly every email, so matching on it makes a single self-contact
 * absorb the entire mailbox. Sourced from each connected Google account's
 * `config.google_email` (grows automatically when a second account is added)
 * plus the APP_OWNER_EMAIL env.
 */
export async function getSelfEmails(userId: string): Promise<Set<string>> {
  const set = new Set<string>();
  // Base: every connected Google account address + the owner env.
  const rows = await db
    .select({ config: schema.sources.config })
    .from(schema.sources)
    .where(eq(schema.sources.userId, userId));
  for (const r of rows) {
    const email = (r.config as { google_email?: string } | null)?.google_email;
    if (email) set.add(email.toLowerCase());
  }
  const owner = process.env.APP_OWNER_EMAIL?.toLowerCase();
  if (owner) set.add(owner);
  if (set.size === 0) return set;

  // Expand: any contact whose card carries a base self address IS the user, so
  // every address on that card (aliases, work email, etc.) is also "self".
  const base = [...set];
  const selfRaws = await db
    .select({ contactId: schema.rawContacts.contactId })
    .from(schema.rawContacts)
    .innerJoin(
      schema.contacts,
      eq(schema.contacts.id, schema.rawContacts.contactId),
    )
    .where(
      and(
        eq(schema.contacts.userId, userId),
        arrayOverlaps(schema.rawContacts.emails, base),
      ),
    );
  const selfContactIds = [
    ...new Set(
      selfRaws.map((r) => r.contactId).filter((id): id is string => !!id),
    ),
  ];
  if (selfContactIds.length > 0) {
    const moreRaws = await db
      .select({ emails: schema.rawContacts.emails })
      .from(schema.rawContacts)
      .where(inArray(schema.rawContacts.contactId, selfContactIds));
    for (const r of moreRaws) {
      for (const e of r.emails ?? []) if (e) set.add(e.toLowerCase());
    }
  }
  return set;
}

/**
 * Relink one contact's diary rows.
 *
 * Strategy:
 *  1. Pull all phones+emails from the contact's raw_contacts.
 *  2. UPDATE message_threads.contact_id WHERE handle ∈ (phones ∪ emails).
 *  3. Cascade: UPDATE messages.contact_id from their thread.
 *  4. UPDATE emails.contact_id WHERE from_email ∈ emails OR to_emails && emails.
 *  5. Cascade: UPDATE email_threads.contact_id from their emails.
 *  6. UPDATE call_logs.contact_id WHERE handle ∈ phones.
 *  7. UPDATE calendar_events.contact_id WHERE attendees && emails.
 */
/**
 * Fill a contact's primaryEmail/primaryPhone from its (non-self) raw records
 * when currently empty. Never overrides a primary already chosen at merge time.
 */
async function refreshContactPrimaries(
  contactId: string,
  emailsArr: string[],
  phonesArr: string[],
): Promise<void> {
  if (emailsArr.length === 0 && phonesArr.length === 0) return;
  const [c] = await db
    .select({
      primaryEmail: schema.contacts.primaryEmail,
      primaryPhone: schema.contacts.primaryPhone,
    })
    .from(schema.contacts)
    .where(eq(schema.contacts.id, contactId))
    .limit(1);
  if (!c) return;
  const set: { primaryEmail?: string; primaryPhone?: string; updatedAt: Date } = {
    updatedAt: new Date(),
  };
  let changed = false;
  if (!c.primaryEmail && emailsArr[0]) {
    set.primaryEmail = emailsArr[0];
    changed = true;
  }
  if (!c.primaryPhone && phonesArr[0]) {
    set.primaryPhone = phonesArr[0];
    changed = true;
  }
  if (!changed) return;
  await db.update(schema.contacts).set(set).where(eq(schema.contacts.id, contactId));
}

export async function relinkContact(contactId: string): Promise<RelinkResult> {
  const [owner] = await db
    .select({ userId: schema.contacts.userId })
    .from(schema.contacts)
    .where(eq(schema.contacts.id, contactId))
    .limit(1);
  const selfEmails = owner ? await getSelfEmails(owner.userId) : new Set<string>();

  const raws = await db
    .select({
      emails: schema.rawContacts.emails,
      phones: schema.rawContacts.phones,
    })
    .from(schema.rawContacts)
    .where(eq(schema.rawContacts.contactId, contactId));

  const emails = new Set<string>();
  const phones = new Set<string>();
  for (const r of raws) {
    for (const e of r.emails ?? []) {
      const lo = e?.toLowerCase();
      if (lo && !selfEmails.has(lo)) emails.add(lo);
    }
    for (const p of r.phones ?? []) if (p) phones.add(p);
  }
  const emailsArr = [...emails];
  const phonesArr = [...phones];

  // Keep the contact's primary email/phone populated from its (non-self) raw
  // records so the contact card and list view show contact info.
  await refreshContactPrimaries(contactId, emailsArr, phonesArr);

  const result: RelinkResult = {
    contactId,
    messageThreads: 0,
    messages: 0,
    emailThreads: 0,
    emails: 0,
    callLogs: 0,
    calendarEvents: 0,
  };

  // Phone-keyed: build the contact's handle maps (same pure matcher as the
  // bulk pass — lib/relink-match.ts owns the case/normalization policy), fetch
  // dangling threads/calls, match in JS (string-equality SQL won't work
  // because iMessage/CallHistory store +E164 while Apple Contacts stores
  // arbitrary user-formatted strings).
  const maps = {
    emailToContact: new Map(emailsArr.map((e) => [e, contactId])),
    phoneToContact: new Map(
      phonesArr
        .map((p) => normalizePhone(p))
        .filter((n): n is string => !!n)
        .map((n) => [n, contactId] as const),
    ),
  };

  // Message threads
  if (maps.phoneToContact.size > 0 || maps.emailToContact.size > 0) {
    const dangling = await db
      .select({
        id: schema.messageThreads.id,
        handle: schema.messageThreads.handle,
      })
      .from(schema.messageThreads)
      .where(isNull(schema.messageThreads.contactId));
    const matchedThreadIds: string[] = [];
    for (const t of dangling) {
      if (matchThreadHandle(t.handle, maps)) matchedThreadIds.push(t.id);
    }
    if (matchedThreadIds.length > 0) {
      await db
        .update(schema.messageThreads)
        .set({ contactId, updatedAt: new Date() })
        .where(inArray(schema.messageThreads.id, matchedThreadIds));
      result.messageThreads = matchedThreadIds.length;
      // Cascade to messages
      const updatedMessages = await db
        .update(schema.messages)
        .set({ contactId })
        .where(
          and(
            inArray(schema.messages.threadId, matchedThreadIds),
            isNull(schema.messages.contactId),
          ),
        )
        .returning({ id: schema.messages.id });
      result.messages = updatedMessages.length;
    }
  }

  // Call logs by normalized phone
  if (maps.phoneToContact.size > 0) {
    const dangling = await db
      .select({ id: schema.callLogs.id, handle: schema.callLogs.handle })
      .from(schema.callLogs)
      .where(isNull(schema.callLogs.contactId));
    const matchedCallIds: string[] = [];
    for (const c of dangling) {
      if (matchCallHandle(c.handle, maps)) matchedCallIds.push(c.id);
    }
    if (matchedCallIds.length > 0) {
      await db
        .update(schema.callLogs)
        .set({ contactId })
        .where(inArray(schema.callLogs.id, matchedCallIds));
      result.callLogs = matchedCallIds.length;
    }
  }

  // Emails by from_email (single-valued) or to_emails overlap. Matching is
  // lower()-normalized in SQL so it agrees with the JS matcher in
  // lib/relink-match.ts even if a future ingest source stores mixed case
  // (emailsArr is already lowercased above; gmail sync lowercases at write
  // time, so today lower() is a no-op that costs one function call per
  // dangling row — the partial emails_dangling_idx keeps the scan bounded).
  if (emailsArr.length > 0) {
    const updatedEmails = await db
      .update(schema.emails)
      .set({ contactId })
      .where(
        and(
          isNull(schema.emails.contactId),
          or(
            sql`lower(${schema.emails.fromEmail}) = any(${emailsArr})`,
            sql`exists (select 1 from unnest(${schema.emails.toEmails}) as t(addr) where lower(t.addr) = any(${emailsArr}))`,
          ),
        ),
      )
      .returning({ id: schema.emails.id, threadId: schema.emails.threadId });
    result.emails = updatedEmails.length;

    // Cascade to email_threads: any thread containing one of these emails.
    const threadIds = [
      ...new Set(
        updatedEmails
          .map((e) => e.threadId)
          .filter((id): id is string => !!id),
      ),
    ];
    if (threadIds.length > 0) {
      const updatedThreads = await db
        .update(schema.emailThreads)
        .set({ contactId, updatedAt: new Date() })
        .where(
          and(
            inArray(schema.emailThreads.id, threadIds),
            isNull(schema.emailThreads.contactId),
          ),
        )
        .returning({ id: schema.emailThreads.id });
      result.emailThreads = updatedThreads.length;
    }

    // Calendar events by attendee email overlap (lower()-normalized, same
    // policy as matchAttendees in lib/relink-match.ts).
    const updatedEvents = await db
      .update(schema.calendarEvents)
      .set({ contactId })
      .where(
        and(
          isNull(schema.calendarEvents.contactId),
          sql`exists (select 1 from unnest(${schema.calendarEvents.attendees}) as t(addr) where lower(t.addr) = any(${emailsArr}))`,
        ),
      )
      .returning({ id: schema.calendarEvents.id });
    result.calendarEvents = updatedEvents.length;
  }

  return result;
}

/**
 * Bulk relink for every contact owned by a user.
 *
 * Single-pass approach — much cheaper than calling relinkContact per
 * contact when many contacts and many diary rows exist:
 *  1. Build (normalized phone → contactId) and (email → contactId) maps
 *     across the user's raw_contacts in one query.
 *  2. Walk each diary table once, look up the row's handle/from_email
 *     in the maps, batch UPDATEs by target contactId.
 */
export async function relinkAfterMerge(
  userId: string,
): Promise<{ contacts: number; totals: Omit<RelinkResult, "contactId"> }> {
  const totals = {
    messageThreads: 0,
    messages: 0,
    emailThreads: 0,
    emails: 0,
    callLogs: 0,
    calendarEvents: 0,
  };

  const selfEmails = await getSelfEmails(userId);

  // Step 1: build lookup maps from this user's raw_contacts.
  const raws = await db
    .select({
      contactId: schema.rawContacts.contactId,
      emails: schema.rawContacts.emails,
      phones: schema.rawContacts.phones,
    })
    .from(schema.rawContacts)
    .innerJoin(
      schema.contacts,
      eq(schema.contacts.id, schema.rawContacts.contactId),
    )
    .where(eq(schema.contacts.userId, userId));

  // Shared pure matcher (lib/relink-match.ts) — same maps + policy as the
  // per-contact path, so the two can never diverge again.
  const maps = buildHandleMaps(raws, selfEmails);
  const { contactIds } = maps;

  // Helper: group ids by target contactId, then issue one UPDATE per group.
  const updateByGroup = async <T extends { id: string; cid: string }>(
    rows: T[],
    runUpdate: (cid: string, ids: string[]) => Promise<number>,
  ): Promise<number> => {
    const groups = new Map<string, string[]>();
    for (const { id, cid } of rows) {
      const arr = groups.get(cid) ?? [];
      arr.push(id);
      groups.set(cid, arr);
    }
    let total = 0;
    for (const [cid, ids] of groups) total += await runUpdate(cid, ids);
    return total;
  };

  // Step 2a: message threads (by handle).
  const danglingThreads = await db
    .select({
      id: schema.messageThreads.id,
      handle: schema.messageThreads.handle,
    })
    .from(schema.messageThreads)
    .where(isNull(schema.messageThreads.contactId));
  const threadMatches: { id: string; cid: string }[] = [];
  for (const t of danglingThreads) {
    const cid = matchThreadHandle(t.handle, maps);
    if (cid) threadMatches.push({ id: t.id, cid });
  }
  totals.messageThreads = await updateByGroup(threadMatches, async (cid, ids) => {
    await db
      .update(schema.messageThreads)
      .set({ contactId: cid, updatedAt: new Date() })
      .where(inArray(schema.messageThreads.id, ids));
    // cascade to messages
    const m = await db
      .update(schema.messages)
      .set({ contactId: cid })
      .where(
        and(
          inArray(schema.messages.threadId, ids),
          isNull(schema.messages.contactId),
        ),
      )
      .returning({ id: schema.messages.id });
    totals.messages += m.length;
    return ids.length;
  });

  // Step 2b: call logs (by normalized phone).
  const danglingCalls = await db
    .select({ id: schema.callLogs.id, handle: schema.callLogs.handle })
    .from(schema.callLogs)
    .where(isNull(schema.callLogs.contactId));
  const callMatches: { id: string; cid: string }[] = [];
  for (const c of danglingCalls) {
    const cid = matchCallHandle(c.handle, maps);
    if (cid) callMatches.push({ id: c.id, cid });
  }
  totals.callLogs = await updateByGroup(callMatches, async (cid, ids) => {
    await db
      .update(schema.callLogs)
      .set({ contactId: cid })
      .where(inArray(schema.callLogs.id, ids));
    return ids.length;
  });

  // Step 2c: emails — fetch all dangling rows ONCE, match each to a contact via
  // the email→contact map (self-excluded), then batch-update grouped by contact.
  // O(dangling) instead of O(contacts × emails) — a large backlog (tens of
  // thousands of unlinked emails) used to make this scan the emails table once
  // per contact and blow past the function time limit.
  const danglingEmails = await db
    .select({
      id: schema.emails.id,
      fromEmail: schema.emails.fromEmail,
      toEmails: schema.emails.toEmails,
      threadId: schema.emails.threadId,
    })
    .from(schema.emails)
    .where(isNull(schema.emails.contactId));

  const emailMatches: { id: string; cid: string }[] = [];
  const threadsByContact = new Map<string, Set<string>>();
  for (const e of danglingEmails) {
    const cid = matchEmailRow(e, maps);
    if (!cid) continue;
    emailMatches.push({ id: e.id, cid });
    if (e.threadId) {
      const s = threadsByContact.get(cid) ?? new Set<string>();
      s.add(e.threadId);
      threadsByContact.set(cid, s);
    }
  }
  totals.emails = await updateByGroup(emailMatches, async (cid, ids) => {
    await db
      .update(schema.emails)
      .set({ contactId: cid })
      .where(inArray(schema.emails.id, ids));
    return ids.length;
  });
  // Cascade to email_threads.
  for (const [cid, tids] of threadsByContact) {
    const updated = await db
      .update(schema.emailThreads)
      .set({ contactId: cid, updatedAt: new Date() })
      .where(
        and(
          inArray(schema.emailThreads.id, [...tids]),
          isNull(schema.emailThreads.contactId),
        ),
      )
      .returning({ id: schema.emailThreads.id });
    totals.emailThreads += updated.length;
  }

  // Calendar events — fetch dangling once, match by attendee overlap.
  const danglingEvents = await db
    .select({
      id: schema.calendarEvents.id,
      attendees: schema.calendarEvents.attendees,
    })
    .from(schema.calendarEvents)
    .where(isNull(schema.calendarEvents.contactId));
  const eventMatches: { id: string; cid: string }[] = [];
  for (const ev of danglingEvents) {
    const cid = matchAttendees(ev.attendees, maps);
    if (cid) eventMatches.push({ id: ev.id, cid });
  }
  totals.calendarEvents = await updateByGroup(eventMatches, async (cid, ids) => {
    await db
      .update(schema.calendarEvents)
      .set({ contactId: cid })
      .where(inArray(schema.calendarEvents.id, ids));
    return ids.length;
  });

  return { contacts: contactIds.size, totals };
}
