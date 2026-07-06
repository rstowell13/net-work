/**
 * Shared time/date formatting. Two families:
 *  - LLM-prompt formatters (fmtDate, fmtTime): compact, ISO-based, locale-
 *    independent — used when building transcript text sent to the model.
 *  - UI-facing formatters (daysAgoLabel, daysAgoShort, fmtTimeLocale,
 *    fmtDateHeader): rendered to the user, locale-aware where relevant.
 *
 * Two "days ago" phrasings exist across the app and both are preserved
 * verbatim rather than unified, since they read differently by design:
 *  - daysAgoLabel: "today" / "1 day ago" / "N days ago" (triage surfaces).
 *  - daysAgoShort: "0d ago" / "1d ago" / "Nd ago" (compact list/detail rows).
 */

/** Triage-style relative label: "today", "1 day ago", "N days ago". */
export function daysAgoLabel(d: Date | null, now: number): string {
  if (!d) return "—";
  const days = Math.floor((now - d.getTime()) / 86400_000);
  if (days < 1) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

/** Compact relative label: "just now", "1d ago", "Nd ago". */
export function daysAgoShort(d: Date, now: number): string {
  const days = Math.floor((now - d.getTime()) / 86400_000);
  if (days === 0) return "just now";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

/** `YYYY-MM-DD` — compact date for LLM prompt transcripts. */
export function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** `YYYY-MM-DD HH:MM` — compact date+time for LLM prompt transcripts. */
export function fmtTime(d: Date): string {
  return d.toISOString().slice(0, 16).replace("T", " ");
}

/** Locale time-of-day for UI display, e.g. "3:45 PM". */
export function fmtTimeLocale(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Locale date header for UI display, e.g. "Tuesday, March 4[, 2025]". */
export function fmtDateHeader(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}
