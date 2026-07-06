/**
 * Classify a candidate group of RawContacts into a confidence tier.
 * Pure — no DB access.
 */
import { normalizeRaw } from "./normalize";
import { nameKey } from "./nicknames";

export type Confidence = "exact" | "high" | "ambiguous";

export interface ConfidenceInput {
  id: string;
  sourceId: string;
  name: string | null;
  emails: string[] | null;
  phones: string[] | null;
  linkedinUrl: string | null;
}

export interface ConfidenceResult {
  confidence: Confidence;
  signals: {
    sharedEmails: string[];
    sharedPhones: string[];
    sharedLinkedIn: string[];
    sharedName: string | null;
    /** Set when names match only after nickname canonicalization (e.g. Joe↔Joseph). */
    sharedNameKey: string | null;
    fieldConflicts: string[];
    /**
     * Set when the group contains a pair the user previously rejected
     * (split/skipped) and only NEW evidence re-connected it — forces the
     * confidence to "ambiguous" so it can never auto-merge again.
     */
    containsRejectedPair?: boolean;
  };
}

function unionAll(sets: Set<string>[]): Set<string> {
  const out = new Set<string>();
  for (const s of sets) for (const v of s) out.add(v);
  return out;
}

export function classify(group: ConfidenceInput[]): ConfidenceResult | null {
  if (group.length < 2) return null;

  const norm = group.map(normalizeRaw);
  const emailSets = norm.map((n) => new Set(n.emails));
  const phoneSets = norm.map((n) => new Set(n.phones));
  const linkedinSets = norm.map((n) =>
    new Set(n.linkedin ? [n.linkedin] : []),
  );
  const names = norm.map((n) => n.name);

  // Pairwise email intersection (any two share an email).
  const allEmails = unionAll(emailSets);
  const emailPairwise = [...allEmails].filter(
    (e) => emailSets.filter((s) => s.has(e)).length >= 2,
  );

  const allPhones = unionAll(phoneSets);
  const phonePairwise = [...allPhones].filter(
    (p) => phoneSets.filter((s) => s.has(p)).length >= 2,
  );

  const allLinkedIn = unionAll(linkedinSets);
  const linkedinPairwise = [...allLinkedIn].filter(
    (l) => linkedinSets.filter((s) => s.has(l)).length >= 2,
  );

  const allNames = new Set(names.filter((n): n is string => !!n));
  const sharedName =
    allNames.size === 1 && names.every((n) => n) ? [...allNames][0] : null;

  // Nickname-canonicalized name key: "Joe Prezuti" and "Joseph Prezuti" share
  // one. Reported as a signal so the UI can label "nickname match"; it never
  // promotes confidence on its own — a nickname group still has differing raw
  // names, so it stays ambiguous unless an email/phone/LinkedIn also matches.
  const nameKeys = names.map((n) => nameKey(n));
  const allNameKeys = new Set(nameKeys.filter((k): k is string => !!k));
  const sharedNameKey =
    allNameKeys.size === 1 && nameKeys.every((k) => k)
      ? [...allNameKeys][0]
      : null;

  const fieldConflicts: string[] = [];
  // Conflicting non-empty names with no shared identifier => signal of conflict.
  if (allNames.size > 1) fieldConflicts.push("name");

  const signals = {
    sharedEmails: emailPairwise,
    sharedPhones: phonePairwise,
    sharedLinkedIn: linkedinPairwise,
    sharedName,
    sharedNameKey,
    fieldConflicts,
  };

  if (emailPairwise.length > 0) {
    return { confidence: "exact", signals };
  }
  if (phonePairwise.length > 0 || linkedinPairwise.length > 0) {
    return { confidence: "high", signals };
  }
  // Same exact normalized name across all members — high if no conflicting name.
  if (sharedName && fieldConflicts.length === 0) {
    return { confidence: "high", signals };
  }
  return { confidence: "ambiguous", signals };
}
