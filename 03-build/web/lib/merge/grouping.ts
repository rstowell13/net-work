/**
 * Pure duplicate-grouping core. No DB / no server-only deps so it can be
 * unit-tested and imported anywhere. dedupe.ts wraps this with the DB I/O.
 *
 * Unions raw records on shared identifiers (email/phone/LinkedIn/name) plus
 * nickname- and look-alike name keys, then classifies each multi-record group.
 */
import { normalizeRaw } from "./normalize";
import { classify, type ConfidenceResult } from "./confidence";
import { nameKey, initialKey, emailLocalName } from "./nicknames";
import { isRoleAddress } from "@/lib/contacts/role-address";

// Look-alike buckets (first-initial + surname) larger than this are ignored —
// they're almost always distinct people who happen to share an initial+surname.
// Real duplicates also share a name/email/phone/nickname key, so they still group.
const INITIAL_KEY_BUCKET_CAP = 4;

class UnionFind {
  parent = new Map<string, string>();
  find(x: string): string {
    let p = this.parent.get(x) ?? x;
    if (p === x) return x;
    p = this.find(p);
    this.parent.set(x, p);
    return p;
  }
  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
  add(x: string) {
    if (!this.parent.has(x)) this.parent.set(x, x);
  }
}

export interface DedupeRawInput {
  id: string;
  sourceId: string;
  contactId: string | null;
  name: string | null;
  emails: string[] | null;
  phones: string[] | null;
  linkedinUrl: string | null;
}

export interface DedupeGroup {
  rawContactIds: string[];
  confidence: ConfidenceResult["confidence"];
  signals: ConfidenceResult["signals"];
}

/**
 * Union raw records into duplicate groups and classify each. Skips the user's
 * own addresses, oversized look-alike buckets, and groups that are just one
 * saved contact's own records. Downgrades name-only matches between two+ saved
 * contacts to "ambiguous" so distinct same-name people are never auto-merged.
 */
export function groupDuplicates(
  rows: DedupeRawInput[],
  selfEmails: Set<string> = new Set(),
): DedupeGroup[] {
  const uf = new UnionFind();
  rows.forEach((r) => uf.add(r.id));

  const indexBy = (
    key: string,
    val: string,
    id: string,
    map: Map<string, string[]>,
  ) => {
    const k = `${key}:${val}`;
    const arr = map.get(k) ?? [];
    if (!arr.includes(id)) arr.push(id); // one id per key (a record may derive the same key twice)
    map.set(k, arr);
  };
  const map = new Map<string, string[]>();

  // Index a "first last" name (real or email-derived) under the nickname and
  // look-alike keys. Email-derived names land here so a no-name contact bridges
  // to a named one via the name in their address — always in the review tier.
  const indexName = (name: string | null, id: string) => {
    const nk = nameKey(name);
    if (nk) indexBy("namekey", nk, id, map);
    const ik = initialKey(name);
    if (ik) indexBy("initialkey", ik, id, map);
  };

  for (const r of rows) {
    const n = normalizeRaw(r);
    // Don't index role / automated (info@, noreply@, …) or the user's own
    // addresses as match keys — they'd glue unrelated raws together.
    for (const e of n.emails) {
      if (isRoleAddress(e) || selfEmails.has(e)) continue;
      indexBy("email", e, r.id, map);
      // Bridge on a name embedded in the address (holden.latimer@ → Holden Latimer).
      indexName(emailLocalName(e), r.id);
    }
    for (const p of n.phones) indexBy("phone", p, r.id, map);
    if (n.linkedin) indexBy("linkedin", n.linkedin, r.id, map);
    if (n.name) indexBy("name", n.name, r.id, map);
    // Nickname-folded name key bridges "Joe Prezuti" ↔ "Joseph Prezuti".
    indexName(n.name, r.id);
  }

  for (const [key, ids] of map.entries()) {
    if (key.startsWith("initialkey:") && ids.length > INITIAL_KEY_BUCKET_CAP) {
      continue;
    }
    for (let i = 1; i < ids.length; i++) uf.union(ids[0], ids[i]);
  }

  const groups = new Map<string, string[]>();
  for (const r of rows) {
    const root = uf.find(r.id);
    const g = groups.get(root) ?? [];
    g.push(r.id);
    groups.set(root, g);
  }

  const byId = new Map(rows.map((r) => [r.id, r]));
  const out: DedupeGroup[] = [];
  for (const ids of groups.values()) {
    if (ids.length < 2) continue;
    const memberRows = ids.map((id) => byId.get(id)!);

    // How many distinct saved contacts does this group span?
    const existingContactIds = new Set(
      memberRows.map((r) => r.contactId).filter((c): c is string => !!c),
    );
    const hasLoose = memberRows.some((r) => !r.contactId);
    // Skip a group that is just one saved contact's own records — that's not a
    // duplicate, there's nothing to merge.
    if (!hasLoose && existingContactIds.size === 1) continue;

    const result = classify(memberRows);
    if (!result) continue;

    let confidence = result.confidence;
    // Merging two+ already-saved contacts is consequential (one gets
    // soft-deleted). Only auto/bulk-merge them when a real identifier
    // (email/phone/LinkedIn) is shared ACROSS the distinct contacts. If their
    // only link is a matching name — even if one contact has the same email on
    // two of its own source records — route to "needs a closer look" so
    // distinct same-name people are confirmed by hand, never auto-merged.
    if (confidence !== "ambiguous" && existingContactIds.size >= 2) {
      const owners = new Map<string, Set<string>>();
      const addOwner = (val: string, cid: string | null) => {
        if (!cid) return;
        const s = owners.get(val) ?? new Set<string>();
        s.add(cid);
        owners.set(val, s);
      };
      for (const m of memberRows) {
        const n = normalizeRaw(m);
        for (const e of n.emails)
          if (!isRoleAddress(e) && !selfEmails.has(e)) addOwner(`e:${e}`, m.contactId);
        for (const p of n.phones) addOwner(`p:${p}`, m.contactId);
        if (n.linkedin) addOwner(`l:${n.linkedin}`, m.contactId);
      }
      const sharedAcrossContacts = [...owners.values()].some((s) => s.size >= 2);
      if (!sharedAcrossContacts) confidence = "ambiguous";
    }

    out.push({ rawContactIds: ids, confidence, signals: result.signals });
  }
  return out;
}
