/**
 * Pure duplicate-grouping core. No DB / no server-only deps so it can be
 * unit-tested and imported anywhere. dedupe.ts wraps this with the DB I/O.
 *
 * Unions raw records on shared identifiers (email/phone/LinkedIn/name) plus a
 * nickname-folded name key and names parsed from structured email addresses,
 * then classifies each multi-record group.
 */
import { normalizeRaw } from "./normalize";
import { classify, type ConfidenceResult } from "./confidence";
import { nameKey, emailLocalName } from "./nicknames";
import { isRoleAddress } from "@/lib/contacts/role-address";

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
 * Union raw records into duplicate groups and classify each. Matching keys:
 * exact email / phone / LinkedIn / name, plus a nickname-folded name key
 * (Joe↔Joseph, surname kept exact). A name parsed from a structured email
 * local-part (holden.latimer@ → "Holden Latimer") bridges a no-name record to a
 * record carrying that REAL name — never to another email-parsed name, so
 * no-reply@/account-services@ collisions can't glue strangers together.
 *
 * There is deliberately NO first-initial+surname "look-alike" matching: it keys
 * on generic last words ("Card", "Services", "News", "Inc") and over-globs
 * distinct same-initial people ("Jared" vs "John Anderson"), which produced far
 * more noise than signal.
 *
 * Skips the user's own + role addresses and groups that are just one saved
 * contact's own records. Two+ saved contacts stay auto/bulk-mergeable only when
 * a real identifier is shared across them (see below).
 */
/** Stable key for a candidate group — lets a re-scan skip a group the user split. */
export function groupKey(rawContactIds: string[]): string {
  return [...rawContactIds].sort().join(",");
}

export function groupDuplicates(
  rows: DedupeRawInput[],
  selfEmails: Set<string> = new Set(),
  suppressedKeys: Set<string> = new Set(),
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
    if (!arr.includes(id)) arr.push(id);
    map.set(k, arr);
  };
  const map = new Map<string, string[]>();

  // Owners of each REAL nickname key (from a contact's actual name). An
  // email-parsed name bridges to these, but two email-parsed names never glue to
  // each other.
  const realNameKeyOwners = new Map<string, string[]>();
  const emailNameKeys: Array<{ id: string; key: string }> = [];

  for (const r of rows) {
    const n = normalizeRaw(r);
    for (const e of n.emails) {
      if (isRoleAddress(e) || selfEmails.has(e)) continue;
      indexBy("email", e, r.id, map);
      const ek = nameKey(emailLocalName(e));
      if (ek) emailNameKeys.push({ id: r.id, key: ek });
    }
    for (const p of n.phones) indexBy("phone", p, r.id, map);
    if (n.linkedin) indexBy("linkedin", n.linkedin, r.id, map);
    if (n.name) {
      indexBy("name", n.name, r.id, map);
      // Nickname-folded name key bridges "Joe Smith" ↔ "Joseph Smith".
      const nk = nameKey(n.name);
      if (nk) {
        indexBy("namekey", nk, r.id, map);
        const arr = realNameKeyOwners.get(nk) ?? [];
        if (!arr.includes(r.id)) arr.push(r.id);
        realNameKeyOwners.set(nk, arr);
      }
    }
  }

  for (const ids of map.values()) {
    for (let i = 1; i < ids.length; i++) uf.union(ids[0], ids[i]);
  }

  // Bridge each email-parsed name only to records that carry it as a real name.
  for (const { id, key } of emailNameKeys) {
    const owners = realNameKeyOwners.get(key);
    if (!owners) continue;
    for (const o of owners) if (o !== id) uf.union(id, o);
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
    // A group the user already split (declared "not the same") must not return.
    if (suppressedKeys.has(groupKey(ids))) continue;
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
