/**
 * Agent token issuance + validation. Tokens are random 32-byte values
 * shown to the user once at issue time and stored on the server only as
 * a SHA-256 hash. Bearer auth on /api/ingest/* compares hashes.
 */
import { eq } from "drizzle-orm";
import { randomBytes, createHash } from "node:crypto";
import { db } from "@/lib/db";
import { agentTokens, sources } from "@/db/schema";

const TOKEN_PREFIX = "nwk_"; // visual marker so the token is grep-able

export function generatePlaintextToken(): string {
  const raw = randomBytes(32).toString("base64url");
  return TOKEN_PREFIX + raw;
}

export function hashToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

/**
 * Issue a fresh agent token for the user's mac_agent source. Replaces
 * any existing un-revoked token (only one active token at a time).
 * Returns BOTH the plaintext (shown to the user once) and the row.
 */
export async function issueAgentToken(args: {
  userId: string;
}): Promise<{ plaintext: string; sourceId: string }> {
  // Ensure mac_agent source row exists
  const allSources = await db
    .select()
    .from(sources)
    .where(eq(sources.userId, args.userId));
  let macSource = allSources.find((s) => s.kind === "mac_agent");
  if (!macSource) {
    const [created] = await db
      .insert(sources)
      .values({
        userId: args.userId,
        kind: "mac_agent",
        status: "not_connected",
      })
      .returning();
    macSource = created;
  }

  // Revoke any existing active tokens
  await db
    .update(agentTokens)
    .set({ revokedAt: new Date() })
    .where(eq(agentTokens.sourceId, macSource.id));

  const plaintext = generatePlaintextToken();
  await db.insert(agentTokens).values({
    sourceId: macSource.id,
    tokenHash: hashToken(plaintext),
  });

  return { plaintext, sourceId: macSource.id };
}

/**
 * Validate a bearer token. Returns the matching mac_agent source row
 * if valid, or null. Side-effect: updates last_seen_at on success.
 */
export async function validateAgentToken(plaintext: string) {
  if (!plaintext.startsWith(TOKEN_PREFIX)) return null;
  const hash = hashToken(plaintext);
  const rows = await db
    .select({
      tokenId: agentTokens.id,
      sourceId: agentTokens.sourceId,
      revokedAt: agentTokens.revokedAt,
    })
    .from(agentTokens)
    .where(eq(agentTokens.tokenHash, hash))
    .limit(1);
  const row = rows[0];
  if (!row || row.revokedAt) return null;
  // Update last_seen_at
  await db
    .update(agentTokens)
    .set({ lastSeenAt: new Date() })
    .where(eq(agentTokens.id, row.tokenId));
  return { sourceId: row.sourceId };
}
