/**
 * Keep-rule for "Unknown" contacts. Pure — no DB / no server-only deps so it can
 * be unit-tested. See lib/contacts/unknown-contacts.ts for the DB orchestration.
 *
 * A contact named exactly "Unknown" (lib/merge/apply.ts falls back to this when a
 * merged candidate's raws are all nameless) is junk UNLESS there was genuine
 * back-and-forth — a 1-on-1 text OR two-way email (≥1 inbound AND ≥1 outbound).
 * Mirrors the two-way bar in lib/merge/promote-criteria.ts (qualifiesForPromotion).
 */

/** The exact placeholder displayName assigned to a no-name merged contact. */
export const UNKNOWN_NAME = "Unknown";

export interface UnknownActivity {
  /** 1-on-1 text messages (group-chat messages don't count as a relationship). */
  messages1on1: number;
  inboundEmail: number;
  outboundEmail: number;
}

/** True when an "Unknown" contact is junk (no real back-and-forth). */
export function isRemovableUnknown(a: UnknownActivity): boolean {
  const twoWayEmail = a.inboundEmail > 0 && a.outboundEmail > 0;
  return a.messages1on1 === 0 && !twoWayEmail;
}
