/**
 * Nickname-aware name keys for dedupe matching.
 *
 * `nameKey` collapses common first-name nicknames to a canonical form while
 * keeping the surname exact, so "Joe Prezuti" and "Joseph Prezuti" produce the
 * same key and get grouped as a possible duplicate. `initialKey` is a looser
 * first-initial + surname key for the "look-alike" review tier.
 *
 * Nickname bridging is best-effort: every group it forms lands in the
 * "ambiguous / needs a closer look" tier (see confidence.ts), so a wrong bridge
 * is always caught by the user, never auto-merged.
 *
 * Pure — no DB access.
 */
import { normalizeName } from "./normalize";

// Each row lists interchangeable first-name variants. The FIRST entry is the
// canonical form the rest collapse to. All lowercase. When a variant appears in
// more than one row, the first row wins (FIRST_TOKEN_CANONICAL build below) —
// this keeps the mapping deterministic; at worst it misses a bridge, never
// invents a wrong high-confidence one.
const NICKNAME_GROUPS: string[][] = [
  ["joseph", "joe", "joey"],
  ["robert", "rob", "bob", "bobby", "robbie", "robb"],
  ["william", "will", "bill", "billy", "willie"],
  ["elizabeth", "liz", "beth", "betsy", "betty", "eliza", "lizzie", "libby"],
  ["michael", "mike", "mickey", "mikey", "mick"],
  ["james", "jim", "jimmy", "jamie"],
  ["david", "dave", "davey"],
  ["thomas", "tom", "tommy"],
  ["christopher", "chris", "kristopher"],
  ["daniel", "dan", "danny"],
  ["matthew", "matt"],
  ["nicholas", "nick", "nicky"],
  ["anthony", "tony"],
  ["richard", "rich", "rick", "dick", "richie", "ricky"],
  ["charles", "charlie", "chuck"],
  ["edward", "ed", "eddie", "ned"],
  ["john", "jack", "johnny", "jon"],
  ["jonathan", "jonny"],
  ["benjamin", "ben", "benny"],
  ["samuel", "sam", "sammy"],
  ["andrew", "andy", "drew"],
  ["joshua", "josh"],
  ["alexander", "alex", "alec", "xander"],
  ["katherine", "kate", "katie", "kathy", "kat", "catherine", "kathryn"],
  ["margaret", "meg", "maggie", "peggy", "marge"],
  ["susan", "sue", "susie", "suzie"],
  ["jennifer", "jen", "jenny", "jenn"],
  ["jessica", "jess", "jessie"],
  ["patricia", "patty", "trish", "tricia"],
  ["patrick", "pat", "paddy"],
  ["stephen", "steve", "steven", "stevie"],
  ["timothy", "tim", "timmy"],
  ["kenneth", "ken", "kenny"],
  ["ronald", "ron", "ronnie"],
  ["donald", "don", "donnie"],
  ["gregory", "greg"],
  ["jeffrey", "jeff", "geoff", "geoffrey"],
  ["lawrence", "larry", "laurence"],
  ["frederick", "fred", "freddie"],
  ["theodore", "ted", "teddy", "theo"],
  ["raymond", "ray"],
  ["albert", "al", "bert"],
  ["vincent", "vince", "vinny"],
  ["peter", "pete"],
  ["philip", "phil", "phillip"],
  ["zachary", "zach", "zack"],
  ["nathaniel", "nathan", "nate"],
  ["gerald", "gerry", "jerry"],
  ["francis", "frank", "frankie"],
  ["walter", "walt", "wally"],
  ["douglas", "doug"],
  ["eugene", "gene"],
  ["leonard", "leon", "lenny"],
  ["barbara", "barb", "babs"],
  ["deborah", "deb", "debbie", "debra"],
  ["cynthia", "cindy"],
  ["rebecca", "becca", "becky"],
  ["victoria", "vicky", "tori"],
  ["christine", "chrissy", "christina", "tina"],
  ["danielle", "dani"],
  ["gabrielle", "gabby", "gabriella"],
  ["isabella", "bella", "izzy", "isabel"],
  ["samantha", "sammie"],
  ["stephanie", "steph", "stephie"],
  ["pamela", "pam"],
  ["sandra", "sandy"],
  ["angela", "angie"],
  ["amanda", "mandy"],
  ["melissa", "mel", "missy"],
];

const FIRST_TOKEN_CANONICAL: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const group of NICKNAME_GROUPS) {
    const canonical = group[0];
    for (const variant of group) {
      if (!m.has(variant)) m.set(variant, canonical);
    }
  }
  return m;
})();

/** Canonical form of a single first-name token (e.g. "bob" → "robert"). */
export function canonicalFirstToken(token: string): string {
  return FIRST_TOKEN_CANONICAL.get(token) ?? token;
}

/**
 * A match key that canonicalizes the first-name token and keeps the surname
 * exact. "Joe Prezuti" and "Joseph Prezuti" both → "joseph prezuti".
 * Returns null for empty or single-token names (no surname to anchor on).
 */
export function nameKey(name: string | null | undefined): string | null {
  const normalized = normalizeName(name);
  if (!normalized) return null;
  const tokens = normalized.split(" ");
  if (tokens.length < 2) return null;
  const [first, ...rest] = tokens;
  return [canonicalFirstToken(first), ...rest].join(" ");
}

/**
 * A looser key: first initial + surname (last token), e.g. "Joe Prezuti" and
 * "Joseph Allen Prezuti" both → "j prezuti". Used only for the look-alike
 * review tier, with bucket-size guardrails applied at the call site.
 * Returns null for single-token names or one-character surnames.
 */
export function initialKey(name: string | null | undefined): string | null {
  const normalized = normalizeName(name);
  if (!normalized) return null;
  const tokens = normalized.split(" ");
  if (tokens.length < 2) return null;
  const first = tokens[0];
  const surname = tokens[tokens.length - 1];
  if (surname.length < 2) return null;
  return `${first[0]} ${surname}`;
}

/**
 * Derive a "first last" name guess from a structured email local-part, e.g.
 * "holden.latimer@…" → "holden latimer", "h.latimer@…" → "h latimer". Returns
 * null for unstructured locals (no separator / single token) or a too-short
 * surname. Feeding this through nameKey/initialKey lets a no-name contact bridge
 * to a named one via the name embedded in their address (always review-tier).
 * Only the common "first.last" ordering is handled — not "last.first".
 */
export function emailLocalName(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.indexOf("@");
  if (at < 1) return null;
  const local = email.slice(0, at).toLowerCase();
  const tokens = local.split(/[._+-]+/).filter((t) => /^[a-z]+$/.test(t));
  if (tokens.length < 2) return null;
  const first = tokens[0];
  const surname = tokens[tokens.length - 1];
  if (surname.length < 3) return null;
  return `${first} ${surname}`;
}
