/**
 * Detect business / department / back-office display names (Collections
 * Department, Accounts Payable, Customer Service, Do Not Reply, …) so they can be
 * kept out of the contact list — never promoted, and swept from triage.
 *
 * Pure — no DB / no server-only deps so it can be unit-tested and imported from
 * both app code and the cleanup script. Same convention as role-address.ts and
 * lib/merge/promote-criteria.ts.
 *
 * HIGH-PRECISION on purpose: only unambiguous back-office signals. Bare "team",
 * "sales", "services", "support", "office", "group" are deliberately NOT matched
 * so real working aliases ("Spencer Team", "Nielsen Jensen Investment Team") and
 * surnames survive. Edit BUSINESS_PATTERNS to tune.
 */

const BUSINESS_PATTERNS = [
  // multi-word back-office phrases
  "accounts payable",
  "accounts receivable",
  "customer (?:service|care|success|support)",
  "client (?:support|services)",
  "help ?desk",
  "service desk",
  "support (?:team|response)",
  "do not reply",
  "no[ -]reply",
  "via docusign",
  // single words (optional trailing s)
  "departments?",
  "collections",
  "billing",
  "notifications?",
  "payroll",
  "invoicing",
];

// Word-boundary anchored so a pattern never matches a substring of a longer real
// word (e.g. "billing" won't hit a surname, "no reply" won't hit "casino reply").
const BUSINESS_RE = new RegExp(`\\b(?:${BUSINESS_PATTERNS.join("|")})\\b`, "i");

export function isBusinessName(name: string | null | undefined): boolean {
  return !!name && BUSINESS_RE.test(name);
}
