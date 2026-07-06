/**
 * Pure staleness check for the app-shell banner: is anything the user
 * should know about broken or gone quiet? No deps — unit-testable
 * without a DB. See lib/staleness-fetch.ts for the DB-fetching wrapper.
 */

const MAC_AGENT_STALE_HOURS = 48;

export type StalenessInput = {
  sourceStatuses: Array<{ kind: string; status: string }>;
  macAgentLastSeenAt: Date | null;
  macAgentConnected: boolean;
};

export type StalenessResult = {
  stale: boolean;
  reasons: string[];
};

/** Given already-fetched inputs, decide whether to show the banner. */
export function computeStaleness(
  input: StalenessInput,
  now: Date = new Date(),
): StalenessResult {
  const reasons: string[] = [];

  for (const s of input.sourceStatuses) {
    if (s.status === "error" || s.status === "needs_reauth") {
      reasons.push(
        s.status === "needs_reauth"
          ? `${s.kind} needs reconnecting`
          : `${s.kind} has a sync error`,
      );
    }
  }

  if (input.macAgentConnected && input.macAgentLastSeenAt) {
    const hoursSince =
      (now.getTime() - input.macAgentLastSeenAt.getTime()) / 3_600_000;
    if (hoursSince > MAC_AGENT_STALE_HOURS) {
      reasons.push("Mac agent hasn't checked in recently");
    }
  }

  return { stale: reasons.length > 0, reasons };
}
