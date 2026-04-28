/**
 * Normalization helpers for dedupe matching.
 * Pure — no DB access.
 */

export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const e = raw.trim().toLowerCase();
  return e.includes("@") ? e : null;
}

export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[^\d+]/g, "");
  if (!digits) return null;
  if (digits.startsWith("+")) {
    const rest = digits.slice(1).replace(/\D/g, "");
    return rest.length >= 7 ? `+${rest}` : null;
  }
  digits = digits.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 7) return `+${digits}`;
  return null;
}

export function normalizeName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const n = raw.trim().toLowerCase().replace(/\s+/g, " ");
  return n.length > 0 ? n : null;
}

export function normalizeLinkedIn(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  let u = raw.trim().toLowerCase();
  u = u.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
  // Keep only the /in/<handle> portion to avoid query-string variance.
  const m = u.match(/linkedin\.com\/in\/([^/?#]+)/);
  if (m) return `linkedin.com/in/${m[1]}`;
  return u.includes("linkedin.com") ? u : null;
}

export interface NormalizedFields {
  emails: string[];
  phones: string[];
  name: string | null;
  linkedin: string | null;
}

export function normalizeRaw(rc: {
  name: string | null;
  emails: string[] | null;
  phones: string[] | null;
  linkedinUrl: string | null;
}): NormalizedFields {
  return {
    emails: (rc.emails ?? [])
      .map(normalizeEmail)
      .filter((e): e is string => !!e),
    phones: (rc.phones ?? [])
      .map(normalizePhone)
      .filter((p): p is string => !!p),
    name: normalizeName(rc.name),
    linkedin: normalizeLinkedIn(rc.linkedinUrl),
  };
}
