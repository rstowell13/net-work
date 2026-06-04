/**
 * Pure text helpers for search. No server-only deps, so they're safe to unit
 * test and to share between the query layer and any client formatting.
 */

/** Escape LIKE metacharacters so user input is matched as a literal substring. */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * A ~140-char snippet centred on the first occurrence of `q` in `text`. Falls
 * back to the head of the text when the literal query isn't present (e.g. a
 * stemmed full-text match like "invest" landing on "invested").
 */
export function makeSnippet(text: string, q: string, radius = 70): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const needle = q.toLowerCase().trim();
  const idx = needle ? clean.toLowerCase().indexOf(needle) : -1;
  if (idx === -1) {
    return clean.length > radius * 2
      ? `${clean.slice(0, radius * 2).trimEnd()}…`
      : clean;
  }
  const start = Math.max(0, idx - radius);
  const end = Math.min(clean.length, idx + needle.length + radius);
  return (
    (start > 0 ? "…" : "") +
    clean.slice(start, end).trim() +
    (end < clean.length ? "…" : "")
  );
}
