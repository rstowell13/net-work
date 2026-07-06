/**
 * Server-fetch the inputs for computeStaleness and evaluate it for a user.
 * Split from lib/staleness.ts (pure logic) so the pure function stays
 * unit-testable without a DB — mirrors the lib/scoring/freshness.ts pattern.
 */
import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agentTokens, sources } from "@/db/schema";
import { computeStaleness, type StalenessResult } from "@/lib/staleness";

export async function getStalenessForUser(
  userId: string,
): Promise<StalenessResult> {
  const sourceRows = await db
    .select({
      id: sources.id,
      kind: sources.kind,
      status: sources.status,
    })
    .from(sources)
    .where(eq(sources.userId, userId));

  const macSource = sourceRows.find((s) => s.kind === "mac_agent");

  let macAgentLastSeenAt: Date | null = null;
  if (macSource && macSource.status === "connected") {
    const tokenRows = await db
      .select({ lastSeenAt: agentTokens.lastSeenAt })
      .from(agentTokens)
      .where(eq(agentTokens.sourceId, macSource.id));
    for (const t of tokenRows) {
      if (
        t.lastSeenAt &&
        (!macAgentLastSeenAt || t.lastSeenAt > macAgentLastSeenAt)
      ) {
        macAgentLastSeenAt = t.lastSeenAt;
      }
    }
  }

  return computeStaleness({
    sourceStatuses: sourceRows.map((s) => ({ kind: s.kind, status: s.status })),
    macAgentLastSeenAt,
    macAgentConnected: macSource?.status === "connected",
  });
}
