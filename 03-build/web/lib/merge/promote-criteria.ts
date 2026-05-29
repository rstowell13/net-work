/**
 * Promotion criteria. Pure — no DB / no server-only deps so it can be
 * unit-tested. See lib/merge/promote.ts for the orchestration.
 */

/**
 * A correspondent qualifies to become a NEW contact only when we have a real
 * name AND there was genuine back-and-forth (≥1 inbound and ≥1 outbound email).
 */
export function qualifiesForPromotion(args: {
  name: string | null;
  inbound: number;
  outbound: number;
}): boolean {
  if (!args.name || args.name.trim().length === 0) return false;
  return args.inbound >= 1 && args.outbound >= 1;
}
