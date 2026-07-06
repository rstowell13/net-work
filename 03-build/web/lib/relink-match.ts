/**
 * Pure matching core for relink: given a contact's (or all contacts') handle
 * maps, decide which contact a dangling diary row belongs to. No DB / no
 * server-only deps so it can be unit-tested (pattern: lib/handles.ts,
 * lib/rebuild-phase.ts).
 *
 * THE policy lives here and nowhere else: emails match by LOWERCASED string
 * equality, phones by last-10-digit normalization (lib/handles.ts). Before
 * 2026-07 the per-contact and bulk relink paths implemented matching
 * independently and disagreed on case handling — any new matcher MUST go
 * through this module. (SQL-side matching in relink.ts mirrors the same
 * policy with lower() expressions; keep them in sync.)
 */
import { normalizePhoneHandle } from "@/lib/handles";

export interface HandleMaps {
  /** lowercased email → contactId */
  emailToContact: Map<string, string>;
  /** normalized (last-10) phone → contactId */
  phoneToContact: Map<string, string>;
}

/**
 * Build handle→contact maps from raw_contacts rows. Lowercases emails,
 * normalizes phones, skips the user's own addresses (matching on a self
 * address would glue the whole mailbox to one contact), first-wins on
 * conflicts (matches the pre-existing bulk-relink behavior).
 */
export function buildHandleMaps(
  raws: {
    contactId: string | null;
    emails: string[] | null;
    phones: string[] | null;
  }[],
  selfEmails: Set<string>,
): HandleMaps & { contactIds: Set<string> } {
  const contactIds = new Set<string>();
  const phoneToContact = new Map<string, string>();
  const emailToContact = new Map<string, string>();
  for (const r of raws) {
    if (!r.contactId) continue;
    contactIds.add(r.contactId);
    for (const p of r.phones ?? []) {
      const n = normalizePhoneHandle(p);
      if (n && !phoneToContact.has(n)) phoneToContact.set(n, r.contactId);
    }
    for (const e of r.emails ?? []) {
      if (!e) continue;
      const lower = e.toLowerCase();
      if (selfEmails.has(lower)) continue; // never match on the user's own address
      if (!emailToContact.has(lower)) emailToContact.set(lower, r.contactId);
    }
  }
  return { emailToContact, phoneToContact, contactIds };
}

/** Message-thread handle: email → lowercased equality, else phone → last-10. */
export function matchThreadHandle(
  handle: string | null,
  maps: HandleMaps,
): string | undefined {
  if (!handle) return undefined;
  if (handle.includes("@")) {
    return maps.emailToContact.get(handle.toLowerCase());
  }
  const n = normalizePhoneHandle(handle);
  return n ? maps.phoneToContact.get(n) : undefined;
}

/** Call-log handle: phones only. */
export function matchCallHandle(
  handle: string | null,
  maps: HandleMaps,
): string | undefined {
  const n = normalizePhoneHandle(handle);
  return n ? maps.phoneToContact.get(n) : undefined;
}

/** Email row: from_email first, then first matching to_ recipient. */
export function matchEmailRow(
  row: { fromEmail: string | null; toEmails: string[] | null },
  maps: HandleMaps,
): string | undefined {
  if (row.fromEmail) {
    const cid = maps.emailToContact.get(row.fromEmail.toLowerCase());
    if (cid) return cid;
  }
  for (const t of row.toEmails ?? []) {
    const cid = maps.emailToContact.get(t.toLowerCase());
    if (cid) return cid;
  }
  return undefined;
}

/** Calendar event: first attendee that maps to a contact. */
export function matchAttendees(
  attendees: string[] | null,
  maps: HandleMaps,
): string | undefined {
  for (const a of attendees ?? []) {
    const cid = maps.emailToContact.get(a.toLowerCase());
    if (cid) return cid;
  }
  return undefined;
}
