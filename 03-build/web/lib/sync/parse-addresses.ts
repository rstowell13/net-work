/**
 * Parse RFC-5322 address-list headers (From / To / Cc) into structured
 * { name, email } entries. Pure — no DB / no server-only deps so it can be
 * unit-tested and imported anywhere.
 *
 * Display-name handling is deliberately conservative: we only keep a name when
 * it's a *real* name, not an echo of the address or its local-part, and we skip
 * MIME encoded-words (`=?UTF-8?...?=`) in v1 rather than store mojibake. Robb's
 * network is ASCII-heavy; non-ASCII decoding is a post-v1 nicety.
 */

export interface AddressEntry {
  name: string | null;
  email: string;
}

const EMAIL_RE = /[^\s<>,@"]+@[^\s<>,@"]+/;

/**
 * Split a header value into individual address tokens, respecting quotes and
 * angle brackets so commas inside `"Smith, Jane"` don't split the token.
 */
function splitAddressList(raw: string): string[] {
  const parts: string[] = [];
  let cur = "";
  let inQuotes = false;
  let inAngle = false;
  for (const ch of raw) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === "<") inAngle = true;
    else if (ch === ">") inAngle = false;
    if (ch === "," && !inQuotes && !inAngle) {
      parts.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

function isRealName(name: string, email: string): boolean {
  const n = name.trim();
  if (!n) return false;
  if (n.includes("@")) return false; // echoed address
  if (n.includes("=?")) return false; // MIME encoded-word — skip in v1
  const local = email.split("@")[0] ?? "";
  if (n.toLowerCase() === email.toLowerCase()) return false;
  if (n.toLowerCase() === local.toLowerCase()) return false;
  return true;
}

export function parseAddressEntries(raw: string): AddressEntry[] {
  if (!raw) return [];
  const out: AddressEntry[] = [];
  for (const token of splitAddressList(raw)) {
    const t = token.trim();
    if (!t) continue;
    const angle = t.match(/<([^>]+)>/);
    const email = (angle ? angle[1] : (t.match(EMAIL_RE)?.[0] ?? ""))
      .trim()
      .toLowerCase();
    if (!email.includes("@")) continue;

    let name: string | null = null;
    if (angle && angle.index !== undefined) {
      const rawName = t.slice(0, angle.index).trim().replace(/^"(.*)"$/, "$1").trim();
      name = isRealName(rawName, email) ? rawName : null;
    }
    out.push({ name, email });
  }
  return out;
}

/** Back-compat: just the addresses, lowercased. */
export function parseAddresses(raw: string): string[] {
  return parseAddressEntries(raw).map((e) => e.email);
}
