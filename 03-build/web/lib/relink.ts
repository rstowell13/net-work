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
import { and, arrayOverlaps, eq, inArray, isNull, or } from "drizzle-orm";
import { db, schema } from "@/lib/db";

/**
 * Phone normalization for handle matching.
 *
 * Apple iMessage / CallHistory store handles in E.164 ("+14155550142").
 * Apple Contacts stores phones however the user typed them
 * ("(415) 555-0142", "415.555.0142", "+1 415 555-0142", etc.).
 *
 * Strip everything non-digit, then keep the last 10 digits — collapses
 * US/Canada numbers across formats. Non-NANP numbers also collapse to
 * digits-only which is good enough for v1 (Robb's network is US-heavy).
 */
function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return null;
  return digits.slice(-10);
}

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
export async function relinkContact(contactId: string): Promise<RelinkResult> {
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
    for (const e of r.emails ?? []) if (e) emails.add(e.toLowerCase());
    for (const p of r.phones ?? []) if (p) phones.add(p);
  }
  const emailsArr = [...emails];
  const phonesArr = [...phones];

  const result: RelinkResult = {
    contactId,
    messageThreads: 0,
    messages: 0,
    emailThreads: 0,
    emails: 0,
    callLogs: 0,
    calendarEvents: 0,
  };

  // Phone-keyed: build the contact's normalized-phone set, fetch dangling
  // threads/calls, match in JS (string-equality SQL won't work because
  // iMessage/CallHistory store +E164 while Apple Contacts stores arbitrary
  // user-formatted strings).
  const normPhones = new Set<string>();
  for (const p of phonesArr) {
    const n = normalizePhone(p);
    if (n) normPhones.add(n);
  }
  // Email handles still match via straight string equality.
  const emailHandles = new Set(emailsArr);

  // Message threads
  if (normPhones.size > 0 || emailHandles.size > 0) {
    const dangling = await db
      .select({
        id: schema.messageThreads.id,
        handle: schema.messageThreads.handle,
      })
      .from(schema.messageThreads)
      .where(isNull(schema.messageThreads.contactId));
    const matchedThreadIds: string[] = [];
    for (const t of dangling) {
      if (!t.handle) continue;
      if (t.handle.includes("@")) {
        if (emailHandles.has(t.handle.toLowerCase())) matchedThreadIds.push(t.id);
      } else {
        const n = normalizePhone(t.handle);
        if (n && normPhones.has(n)) matchedThreadIds.push(t.id);
      }
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
  if (normPhones.size > 0) {
    const dangling = await db
      .select({ id: schema.callLogs.id, handle: schema.callLogs.handle })
      .from(schema.callLogs)
      .where(isNull(schema.callLogs.contactId));
    const matchedCallIds: string[] = [];
    for (const c of dangling) {
      const n = normalizePhone(c.handle);
      if (n && normPhones.has(n)) matchedCallIds.push(c.id);
    }
    if (matchedCallIds.length > 0) {
      await db
        .update(schema.callLogs)
        .set({ contactId })
        .where(inArray(schema.callLogs.id, matchedCallIds));
      result.callLogs = matchedCallIds.length;
    }
  }

  // Emails by from_email (single-valued) or to_emails overlap
  if (emailsArr.length > 0) {
    const updatedEmails = await db
      .update(schema.emails)
      .set({ contactId })
      .where(
        and(
          isNull(schema.emails.contactId),
          or(
            inArray(schema.emails.fromEmail, emailsArr),
            arrayOverlaps(schema.emails.toEmails, emailsArr),
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

    // Calendar events by attendee email overlap.
    const updatedEvents = await db
      .update(schema.calendarEvents)
      .set({ contactId })
      .where(
        and(
          isNull(schema.calendarEvents.contactId),
          arrayOverlaps(schema.calendarEvents.attendees, emailsArr),
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

  const contactIds = new Set<string>();
  const phoneToContact = new Map<string, string>();
  const emailToContact = new Map<string, string>();
  for (const r of raws) {
    if (!r.contactId) continue;
    contactIds.add(r.contactId);
    for (const p of r.phones ?? []) {
      const n = normalizePhone(p);
      if (n && !phoneToContact.has(n)) phoneToContact.set(n, r.contactId);
    }
    for (const e of r.emails ?? []) {
      if (!e) continue;
      const lower = e.toLowerCase();
      if (!emailToContact.has(lower)) emailToContact.set(lower, r.contactId);
    }
  }

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
    if (!t.handle) continue;
    let cid: string | undefined;
    if (t.handle.includes("@")) {
      cid = emailToContact.get(t.handle.toLowerCase());
    } else {
      const n = normalizePhone(t.handle);
      cid = n ? phoneToContact.get(n) : undefined;
    }
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
    const n = normalizePhone(c.handle);
    const cid = n ? phoneToContact.get(n) : undefined;
    if (cid) callMatches.push({ id: c.id, cid });
  }
  totals.callLogs = await updateByGroup(callMatches, async (cid, ids) => {
    await db
      .update(schema.callLogs)
      .set({ contactId: cid })
      .where(inArray(schema.callLogs.id, ids));
    return ids.length;
  });

  // Step 2c: emails — single SQL query per contact still wins because
  // from_email is exact and to_emails uses array overlap operator that
  // postgres can index. Loop per contact id.
  for (const cid of contactIds) {
    // Reverse-lookup the emails for this contact id.
    const emailsForContact: string[] = [];
    for (const [email, mappedCid] of emailToContact)
      if (mappedCid === cid) emailsForContact.push(email);
    if (emailsForContact.length === 0) continue;

    const updatedEmails = await db
      .update(schema.emails)
      .set({ contactId: cid })
      .where(
        and(
          isNull(schema.emails.contactId),
          or(
            inArray(schema.emails.fromEmail, emailsForContact),
            arrayOverlaps(schema.emails.toEmails, emailsForContact),
          ),
        ),
      )
      .returning({ id: schema.emails.id, threadId: schema.emails.threadId });
    totals.emails += updatedEmails.length;

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
        .set({ contactId: cid, updatedAt: new Date() })
        .where(
          and(
            inArray(schema.emailThreads.id, threadIds),
            isNull(schema.emailThreads.contactId),
          ),
        )
        .returning({ id: schema.emailThreads.id });
      totals.emailThreads += updatedThreads.length;
    }

    const updatedEvents = await db
      .update(schema.calendarEvents)
      .set({ contactId: cid })
      .where(
        and(
          isNull(schema.calendarEvents.contactId),
          arrayOverlaps(schema.calendarEvents.attendees, emailsForContact),
        ),
      )
      .returning({ id: schema.calendarEvents.id });
    totals.calendarEvents += updatedEvents.length;
  }

  return { contacts: contactIds.size, totals };
}
