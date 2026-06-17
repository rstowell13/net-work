// Pure predicate deciding whether a contact belongs in the triage queue,
// given the user's strictness rules. Kept free of DB access so it can be
// unit-tested; the queue query computes the signals and calls this.

export interface TriageRules {
  // Require min(inbound, outbound) >= minTwoWay. 0 disables the requirement.
  minTwoWay: number;
  // Require total interactions (inbound + outbound) >= minTotal.
  minTotal: number;
  // Hide contacts whose last interaction is older than this many days.
  // null = no time limit.
  maxAgeDays: number | null;
}

export interface EngagementSignals {
  inbound: number;
  outbound: number;
  total: number;
  lastSeenAt: Date | null;
}

export function qualifiesForTriage(
  s: EngagementSignals,
  rules: TriageRules,
  now: Date = new Date(),
): boolean {
  const twoWay = Math.min(s.inbound, s.outbound);
  if (twoWay < rules.minTwoWay) return false;
  if (s.total < rules.minTotal) return false;
  if (rules.maxAgeDays != null) {
    if (!s.lastSeenAt) return false;
    const days = Math.floor(
      (now.getTime() - s.lastSeenAt.getTime()) / 86400_000,
    );
    if (days > rules.maxAgeDays) return false;
  }
  return true;
}
