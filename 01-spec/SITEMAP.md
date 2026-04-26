# SITEMAP

> Phase 2, Step 1. Every page in v1, one-sentence purpose each.
> Scoped aggressively to the 1-week v1 deadline.

## Conventions

- **[key page]** — carries the product's feel; gets three mockups in Phase 3.
- **[follows X]** — visual pattern follows page X; no separate mockups.

## Public

Single-user app; public surface is minimal.

- **/login** — sign-in page (magic link or single-password; only Robb has
  access).

## Authenticated

All pages behind login. Every page assumes "user = Robb."

- **/** — **Home / This Week.** Default landing page after login.
  Behavior depends on whether Robb has committed to a plan for the
  current week:
  - **If a weekly plan is committed:** shows the 2–5 people Robb
    chose to reach out to this week, their status (not-yet-reached,
    reached, reply-received), open follow-ups for each, and quick
    links into their contact pages.
  - **If no plan is committed yet:** shows a primed suggestion set
    (pre-computed candidates based on recency + category mix) with
    a "Plan this week →" CTA that opens `/suggestions`.
  Either state also shows lightweight stats (contacts triaged,
  open follow-ups, days since last-commit). [key page]

- **/merge** — **Merge list.** Bulk-list view of all suggested
  merge groups across the contact graph. Each row is one group
  (name + summary of source records). Groups with **high-confidence
  matches** (exact name + matching phone or email) are pre-checked
  and can be confirmed en masse with a **Bulk merge** button.
  Groups that need a closer look can be opened individually. Also
  supports manual merge (search + combine two contacts) and
  un-merge. **Merge happens BEFORE triage** — Robb needs a
  well-rounded picture of each person before deciding whether to
  keep them. [key page]

- **/merge/[id]** — **Merge review (single group).** One suggested
  merge group at a time: candidate source records side-by-side
  with overlapping fields highlighted, conflicts called out (two
  different phone numbers, two different emails), and Approve /
  Split / Skip actions. Used for the groups that aren't clean
  exact-matches. [follows /merge]

- **/triage** — **Contact triage (onboarding keep/skip).** One
  *merged* contact at a time, large card with photo, name, all
  identity signals (phone, emails, LinkedIn URL), source badges,
  recency and frequency signals, and a short history preview.
  Keep / Skip via keyboard or buttons. On keep, assign category
  (personal / business / both). Used *once* to onboard the full
  graph; afterward, new contacts enter a smaller to-triage queue
  as sources sync. [key page]

- **/suggestions** — **Weekly outreach suggestions.** Separate from
  triage: this is the card-style flow for choosing who to reach
  out to *this week*. Restricted to contacts Robb has already
  kept. Same card UX as `/triage` but different intent — "reach
  out this week" vs. "skip for now" vs. "not this week but later."
  Commits the chosen set as the week's plan, which then drives
  `/`. [follows /triage]

- **/contacts** — **Bulk list mode.** Full scrollable contact list
  with search, filters (status: to-triage / keep / skip; category;
  last-contacted recency; source), and bulk actions via checkboxes.
  Alternative to `/triage` for onboarding; also the day-to-day
  directory. Each row shows primary identity (name, category,
  tags, last-contacted recency). Filters include **tag**. Bulk
  actions include **Add tag** to many at once. [key page]

- **/contacts/[id]** — **Contact detail.** One person's full
  profile — merged identity across sources, all external links
  (including LinkedIn URL), a **Relationship Summary** card at the
  top (synthesized recap of the relationship from message/call
  history + notes: how you know each other, frequency, last
  interaction, recurring themes, open threads), full message
  history (iMessage + Gmail), call-log history, notes, open
  follow-ups, category, **tags** (chip picker with inline
  create), **"Add to this week"** button (appends to current
  week's plan), cadence settings. The "relationship memory"
  page. [key page]

- **/follow-ups** — **All follow-ups / action items.** Single view
  collecting every open follow-up across all contacts. Filterable
  by contact, age, category. Mark done, snooze, or jump to the
  contact page. [follows /contacts]

- **/settings** — Account + integrations hub. Links to the
  sub-pages below. [follows /]

- **/settings/sources** — Connect and manage data sources: Gmail
  OAuth, Google Contacts OAuth, Google Calendar OAuth (read-
  only), LinkedIn CSV upload, Mac agent status + API token.
  Shows last-sync time per source. [follows /settings]

- **/settings/cadence** — Tune the weekly nudge cadence: how many
  people per week, personal/business mix, minimum days since last
  contact, and **tag-based rules** (e.g. "reach out to 2
  `byu-volleyball` contacts per month"). [follows /settings]

## Mac-side agent

Not a page, but listed here so it's not forgotten: the local Mac
agent is a separate deliverable (a command-line script + LaunchAgent
plist). Its "UI" is `/settings/sources` showing its last-push
timestamp and a "paired / not paired" status.

## Empty and error states

- **/ (empty — no nudges ready)** — shown when all this week's
  suggestions have been acted on or there's nothing to suggest yet.
  CTA: "Go triage more contacts" or "Check back tomorrow."
- **/ (empty — first-run, no triage done)** — shown before Robb has
  done any triage. CTA: "Start triage →" leading to `/triage`.
- **/merge (empty — nothing to merge)** — shown when no duplicate
  groups remain. CTA: "Start triage →" (next step in onboarding).
- **/triage (empty — all triaged)** — shown when the to-triage queue
  is empty. Message + link back to `/`.
- **/suggestions (empty — nothing to plan)** — shown when the
  suggestion pool is empty (e.g., everyone eligible was already
  added to this week's plan). Message + link back to `/`.
- **/contacts (empty — no contacts synced)** — shown before any
  source has synced. CTA: "Connect a data source →
  `/settings/sources`."
- **/follow-ups (empty — none open)** — shown when nothing's open.
  Positive message ("all clear") with link back to `/`.
- **/contacts/[id] (contact not found)** — 404-style, "this contact
  doesn't exist or has been merged."
- **/404** — generic not-found.
- **/500** — generic server error.

## Explicitly NOT in v1

Listed so Phase 2/3 don't reintroduce them:

- No marketing/landing page beyond `/login`.
- No public profile pages.
- No admin UI (single user; ops via direct DB/logs).
- No billing page (single-user app; no billing).
- No team/sharing pages.
- No in-app messaging/compose UI.
