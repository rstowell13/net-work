/**
 * Pure helpers for partitioning a merge group's records across multiple people.
 * No DB / no server-only deps so they can be unit-tested. apply.ts wraps these.
 */

export interface PartitionBucket {
  /** Existing contact this bucket becomes (preserves its curated data). Null/absent = new contact. */
  keepContactId?: string | null;
  /** Name for a new contact (ignored when keepContactId is set). */
  name?: string;
  /** Exactly the record (raw_contact) ids assigned to this person. */
  rawIds: string[];
}

/**
 * Validate a partition request against the candidate. Returns an error code, or
 * null if valid. Records left out of every bucket are allowed (they stay on
 * their current contact).
 */
export function validatePartition(
  candidateRawIds: string[],
  involvedContactIds: string[],
  buckets: PartitionBucket[],
): string | null {
  if (!Array.isArray(buckets)) return "invalid_buckets";
  const candSet = new Set(candidateRawIds);
  const involvedSet = new Set(involvedContactIds);
  const nonEmpty = buckets.filter((b) => b?.rawIds && b.rawIds.length > 0);
  if (nonEmpty.length === 0) return "no_records_assigned";

  const seen = new Set<string>();
  for (const b of buckets) {
    if (b.keepContactId && !involvedSet.has(b.keepContactId)) {
      return "keep_contact_not_involved";
    }
    for (const id of b.rawIds ?? []) {
      if (!candSet.has(id)) return "raw_not_in_candidate";
      if (seen.has(id)) return "raw_assigned_twice";
      seen.add(id);
    }
  }
  const keeps = buckets
    .map((b) => b.keepContactId)
    .filter((c): c is string => !!c);
  if (new Set(keeps).size !== keeps.length) return "duplicate_keep_contact";
  return null;
}

/**
 * Index of the bucket that should inherit a dissolved contact's curated content:
 * the bucket holding the most of that contact's records (ties → earliest bucket).
 * Returns -1 if none of the contact's records were assigned to any bucket.
 */
export function pluralityBucketIndex(
  contactRawIds: string[],
  bucketRawIdSets: Set<string>[],
): number {
  let best = -1;
  let bestCount = 0;
  for (let i = 0; i < bucketRawIdSets.length; i++) {
    let c = 0;
    for (const id of contactRawIds) if (bucketRawIdSets[i].has(id)) c++;
    if (c > bestCount) {
      bestCount = c;
      best = i;
    }
  }
  return best;
}
