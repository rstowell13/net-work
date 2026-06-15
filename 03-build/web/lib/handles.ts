/**
 * Shared handle normalization for matching iMessage/SMS handles against a
 * contact's raw phones/emails. Pure — no DB access.
 *
 * iMessage / CallHistory store phones in E.164 ("+14155550142"); Apple
 * Contacts stores them however the user typed them ("(415) 555-0142", etc.).
 * Strip to digits and keep the last 10 — collapses US/Canada numbers across
 * formats (Robb's network is US-heavy; good enough for v1). Emails match via
 * lowercase string equality.
 *
 * Used by lib/relink.ts (thread/contact linking), the ingest route (storing a
 * group thread's participant roster), and lib/diary.ts (matching group threads
 * to a contact). All three MUST normalize identically or group matching breaks,
 * so they share this module.
 */

export function normalizePhoneHandle(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return null;
  return digits.slice(-10);
}

/**
 * Normalize any iMessage handle (phone or email) to a canonical match key.
 * Emails → lowercase; phones → last-10 digits.
 */
export function normalizeHandle(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  if (raw.includes("@")) {
    const e = raw.trim().toLowerCase();
    return e.length > 0 ? e : null;
  }
  return normalizePhoneHandle(raw);
}
