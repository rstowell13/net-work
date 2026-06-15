/**
 * Detect "role" / automated email addresses (info@, noreply@, support@, …) so
 * they can be kept out of the contact list — never promoted to a contact, never
 * merged, and swept out of existing data.
 *
 * Pure — no DB / no server-only deps so it can be unit-tested and imported from
 * both app code (promote/dedupe) and the cleanup script. Same pattern as
 * lib/merge/promote-criteria.ts and lib/sync/parse-addresses.ts.
 *
 * The lists below are the single source of truth — edit here to tune what counts
 * as a role address.
 */

/**
 * Local-parts that are role addresses on an exact match. A real person whose
 * local-part merely *contains* one of these (e.g. `salesforce-rep`,
 * `info.patel`) is NOT matched — membership is exact.
 */
const ROLE_LOCAL_PARTS = new Set<string>([
  "info",
  "hello",
  "contact",
  "contactus",
  "support",
  "help",
  "helpdesk",
  "sales",
  "billing",
  "accounts",
  "accounting",
  "admin",
  "administrator",
  "office",
  "team",
  "careers",
  "jobs",
  "recruiting",
  "hr",
  "press",
  "media",
  "marketing",
  "newsletter",
  "news",
  "updates",
  "notifications",
  "notification",
  "alerts",
  "alert",
  "mailer",
  "postmaster",
  "webmaster",
  "abuse",
  "security",
  "privacy",
  "legal",
  "compliance",
  "feedback",
  "inquiries",
  "enquiries",
  "orders",
  "order",
  "service",
  "services",
  "customerservice",
  "customercare",
  "subscriptions",
  "subscribe",
  "unsubscribe",
  "system",
  "daemon",
  "donotreply",
]);

/**
 * No-reply / bounce style prefixes. These routinely carry a suffix or
 * sub-address (`noreply-account@`, `bounce+123@`), so they match on prefix.
 */
const ROLE_LOCAL_PREFIXES = [
  "noreply",
  "no-reply",
  "no_reply",
  "donotreply",
  "do-not-reply",
  "do_not_reply",
  "mailer-daemon",
  "mailerdaemon",
  "bounce",
  "bounces",
];

export function isRoleAddress(email: string | null | undefined): boolean {
  if (!email) return false;
  const at = email.indexOf("@");
  if (at <= 0) return false;
  // Local-part, lowercased, with any +tag sub-address stripped.
  const local = email.slice(0, at).trim().toLowerCase().split("+")[0];
  if (!local) return false;
  if (ROLE_LOCAL_PARTS.has(local)) return true;
  return ROLE_LOCAL_PREFIXES.some((p) => local.startsWith(p));
}
