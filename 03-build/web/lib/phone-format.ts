/**
 * Display formatting for phone numbers. Pure — no DB access.
 *
 * Sources hand us the same number in different shapes ("(805) 427-4108",
 * "+18054274108", "8054274108"). For display we collapse them to one canonical
 * value via normalizePhone (E.164) and render US/Canada numbers in national
 * style; everything else stays compact E.164. Robb's network is US-heavy, so
 * polished international spacing isn't worth a dependency here.
 */

import { normalizePhone } from "@/lib/merge/normalize";

/**
 * Format one raw phone for display.
 * US/Canada (+1 + 10 digits) → "(805) 427-4108"; other parseable numbers →
 * compact E.164 ("+442079460958"); unparseable → the input trimmed, as-is
 * (we never silently drop a number the user has on file).
 */
export function formatPhoneDisplay(raw: string | null | undefined): string {
  if (!raw) return "";
  const e164 = normalizePhone(raw);
  if (!e164) return raw.trim();
  const us = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  if (us) return `(${us[1]}) ${us[2]}-${us[3]}`;
  return e164;
}

export interface DisplayPhone {
  /** Human-readable label, e.g. "(805) 427-4108". */
  display: string;
  /** Value for tel:/sms: links — E.164 when parseable, else the raw input. */
  href: string;
}

/**
 * Collapse a list of raw phones to one entry per real number, preserving
 * first-seen order. The dedupe key is the E.164 form (falling back to the
 * trimmed raw for unparseable values).
 */
export function dedupePhonesForDisplay(
  raws: (string | null | undefined)[],
): DisplayPhone[] {
  const seen = new Set<string>();
  const out: DisplayPhone[] = [];
  for (const raw of raws) {
    if (!raw) continue;
    const e164 = normalizePhone(raw);
    const key = e164 ?? raw.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ display: formatPhoneDisplay(raw), href: e164 ?? raw.trim() });
  }
  return out;
}
