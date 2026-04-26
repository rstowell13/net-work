# FEATURE_SPEC

> Phase 2, Step 3. Per-page capabilities. Derived from SITEMAP.md
> and USER_FLOWS.md. Entity names (Contact, Plan, FollowUp, Tag, etc.)
> are placeholders — DATA_MODEL.md formalizes them next.

## Conventions

Each page block lists:
- **Shows** — content visible by default.
- **User can** — actions available.
- **Data touched** — entities read/written.
- **Empty state** — behavior when no data.
- **Edge cases** — notable boundaries.

---

## /login

**Shows:** Simple sign-in form (magic link or single password).
**User can:** Authenticate. That's it.
**Data touched:** Session.
**Edge cases:** Wrong credential → error. No public signup UI (single user).

---

## / (Home / This Week) — [key]

**Shows:**
- **State A — plan committed for the current ISO week:**
  - The 2–5 people in the committed plan, each as a row/card
    with photo, name, category chips, tag chips, last-contacted
    recency, and status (**not-yet-reached / reached / connected**).
  - Per-row quick actions: open contact, mark status, open
    follow-up.
- **State B — no plan for the current week:**
  - A pre-computed suggestion preview (3–5 contacts the cadence
    rules would pick) and a **"Plan this week →"** CTA → `/suggestions`.
- **Always visible:**
  - Header stats strip: contacts triaged (%), open follow-ups count,
    pending triage / merge counts.
  - Subtle banners when background work is ready: "12 new contacts
    to triage," "3 new merge suggestions."

**User can:**
- Mark a plan row's status (not-yet-reached / reached / connected).
- Click into any contact or follow-up.
- Click "Plan this week →" to open `/suggestions`.
- Dismiss a person from this week's plan (not a "skip" — just
  removes them from the week).

**Data touched:** Reads: Contact, WeeklyPlan, FollowUp, ingest/merge
queue sizes. Writes: WeeklyPlan.status fields.

**Empty state:** First-run with no sources → "Connect a data source
→" pointing to `/settings/sources`.

**Edge cases:**
- If current week has no eligible contacts (everyone recently
  contacted), suggestion preview says so and suggests tuning cadence.
- ISO week rollover: a committed plan auto-archives at Monday 00:00
  local; Home reverts to State B.

---

## /merge — [key]

**Shows:**
- Bulk list of suggested merge groups, sorted with high-confidence
  matches on top.
- Each row = one group: merged-display-name, count of source
  records, confidence tier (**Exact** / **High** / **Ambiguous**),
  checkbox (pre-checked for Exact and High).
- Summary bar: "X groups, Y exact, Z ambiguous."

**User can:**
- **Bulk merge** selected groups (one click).
- Open any group → `/merge/[id]`.
- Filter by confidence tier or source.
- Search (find a specific name in the queue).
- Manually initiate a merge: search two contacts → combine.
- Un-merge a previously merged contact (from contact page in
  practice; also supported here).
- **Post-bulk prompt:** after a bulk merge completes, a modal
  offers **"Start triaging"** → `/triage` or **"Keep merging"**
  (stay).

**Data touched:** Reads: Contact, MergeCandidate groups. Writes:
Contact (merge commits), MergeCandidate status.

**Empty state:** "Nothing to merge" + link to `/triage`.

**Edge cases:**
- Bulk-merging thousands of groups is a background job; show a
  progress toast, don't block the UI.
- A group may become stale if new sync data splits it — re-run
  grouping nightly.

---

## /merge/[id] — [follows /merge]

**Shows:** One merge group — candidate source records side by side,
field-by-field diff (name, phone(s), email(s), LinkedIn URL,
source origin), fields that conflict highlighted.

**User can:** Approve merge, Split (keep separate), Skip (revisit
later). When approving, choose which field value wins for conflicts
(default: most recent).

**Data touched:** Reads: Contact, MergeCandidate. Writes: Contact
(merge), MergeCandidate.status.

**Edge cases:** Three-way or larger groups — show all candidates;
conflict resolution is per-field.

---

## /triage — [key]

**Shows:**
- One merged contact card at a time, large.
- On the card: name, photo if available, identity signals (phone
  count, email count, LinkedIn yes/no), source badges, last-
  interaction recency, message/call counts, short history preview.
- Queue progress indicator (e.g., "42 of 687").

**User can:**
- **Keep** (keyboard: right-arrow or K; button: Keep) → prompts for
  category (personal / business / both) → moves to next card.
- **Skip** (keyboard: left-arrow or S; button: Skip) → marked
  "skipped," moves to next card.
- **Back** (undo last decision).
- **Pause / resume** — progress is saved per-contact, not
  session-scoped.

**Data touched:** Reads: Contact queue. Writes: Contact.triageStatus,
Contact.category.

**Empty state:** Queue empty → "All triaged" + link to `/`.

**Edge cases:**
- New contacts appearing post-onboarding enter the queue at the end.
- A contact updated by a later merge may re-enter the queue; system
  should not re-ask Robb about a decision he already made unless the
  contact materially changed.

---

## /suggestions — [follows /triage]

**Shows:** Same card UX as `/triage`, but cards drawn from the
suggestion pool (kept contacts matching cadence rules) and intent
is weekly planning, not initial keep/skip.

**User can:**
- **Add to this week** (keyboard: right; button: Reach out).
- **Not this week** (keyboard: left; button: Not now).
- **Never** (permanently remove from suggestion pool; re-include
  requires explicit action from `/contacts/[id]`).
- **Commit plan** — ends the session and writes the selected set
  as the current week's WeeklyPlan.

**Data touched:** Reads: Contact (kept pool), CadenceRules, last-
interaction timestamps. Writes: WeeklyPlan, per-contact suggestion
metadata.

**Empty state:** Pool empty → message + link back to `/`.

**Edge cases:**
- If Robb commits an empty plan, Home shows State B for the week.
- "Never" is permanent — the only way back is Robb re-enabling
  the contact explicitly from the contact page.

---

## /contacts — [key]

**Shows:** Scrollable list of all contacts (merged), with columns:
name, category, tags (chips, truncated), last-contacted recency,
source badges.

**User can:**
- **Search** by name, email, phone.
- **Filter:** triage status (to-triage / kept / skipped), category,
  tag, last-contacted recency bucket, source.
- **Sort:** name, last-contacted, date added.
- **Checkbox** individual or all rows.
- **Bulk actions:** Keep (with category prompt), Skip, **Add tag**,
  Remove tag, Add to this week's plan.
- Click a row → `/contacts/[id]`.

**Data touched:** Reads: Contact, Tag. Writes: Contact.triageStatus,
Contact.category, ContactTag.

**Empty state:** No contacts synced → "Connect a data source →".

**Edge cases:** Pagination for >1000 rows (virtualized list).

---

## /contacts/[id] — [key]

**Shows, in this order:**
- **Header:** name, photo, category, tag chips (add/remove chip
  picker, inline create), **Freshness Score** (see "Freshness
  Score" under Cross-page behaviors), **"Add to this week"**
  button, external action links: **Call**, **Text/iMessage**
  (opens Messages / `sms:`), **Email** (`mailto:`), **LinkedIn**
  (URL click-out).
- **Relationship Summary card** — a single free-form descriptive
  paragraph of who this person is and the nature of the
  relationship in plain English. No structured metrics, no
  frequency, no last-interaction dates. Cached; regenerated on
  demand.
- **Open Follow-ups** — this contact's open follow-ups (add,
  snooze, mark done).
- **Diary** — chronological feed (newest first by default, with a
  toggle to reverse) combining, from all sources:
  - **Message threads** (iMessage/SMS): grouped into threads by an
    **8-hour-gap rule** — a new message more than 8 hours after
    the previous one starts a new thread. Each thread shows a
    **2–3 sentence summary**, not the raw messages.
  - **Email threads** (Gmail): grouped by native email thread.
    Each shown as a **2–3 sentence summary**, not the full text.
  - **Call log entries** (and, post-v1, recorded/transcribed
    calls).
  - **Calendar events** involving this contact (Google Calendar,
    read-only: title, attendees, date/time).
  - **Personal notes** Robb writes (free-form, timestamped).
  - Any thread/event row is clickable → **opens a modal/panel**
    with the word-for-word detail (full message list, full email
    body, full note, event details).
- **Meta section:** source origins, merge history, cadence
  overrides (per-contact cadence override allowed).

**User can:**
- Edit category, add/remove tags (inline create).
- Add/edit notes.
- Add/resolve follow-ups.
- Toggle this-week status: **Add to this week** / **Remove from
  this week**; if in plan, mark not-yet-reached / reached /
  connected.
- Open the LinkedIn URL in a new tab.
- Regenerate Relationship Summary.
- Un-merge (split off a source record into a standalone contact).

**Data touched:** Reads: Contact, Tag, FollowUp, Note, Message,
MessageThread, EmailThread, CallLog, CalendarEvent (if enabled),
FreshnessScore. Writes: most of the above, plus WeeklyPlan
membership.

**Empty state:** No messages/calls yet → empty state within each
section, not a full-page empty state.

**Edge cases:**
- Very-long-history contacts: lazy-load message pages.
- Relationship Summary should gracefully degrade when history is
  thin ("no interactions on record — this is a new contact").

---

## /follow-ups — [key]

**Shows:** Global list of all open follow-ups across all contacts,
sorted default by age (oldest first).

**User can:**
- **Filter:** by contact, by age, by source (manual / surfaced from
  messages), by tag.
- **Sort:** age, contact name, recently added.
- Per-item: **Mark done**, **Snooze** (7d / 14d / 30d / custom),
  **Open contact** → `/contacts/[id]`.
- **Add follow-up** manually (choose contact + text).

**Data touched:** Reads: FollowUp joined to Contact. Writes:
FollowUp.status, FollowUp.snoozeUntil.

**Empty state:** "All clear" + link to `/`.

**Edge cases:** Snoozed items hidden until their date; resurface
automatically.

---

## /settings

**Shows:** Hub listing sub-pages (sources, cadence) + account info
(logged-in as, sign out).

**User can:** Navigate to sub-pages, sign out.

**Data touched:** Reads: User/Session.

---

## /settings/sources

**Shows:** Each source as a card:
- **Google Contacts** — connected / not, last-sync time, trigger
  manual sync, disconnect.
- **Gmail** — same.
- **Google Calendar** — same (OAuth, read-only). Events with
  matched contacts populate Diary entries.
- **LinkedIn** — file uploader (CSV), list of previous imports
  with timestamps, re-upload option.
- **Mac agent** — paired / not paired, last-push time, rotate
  token, copy install command.

**User can:**
- Start OAuth flow per source, disconnect, re-trigger sync, upload
  a new LinkedIn CSV, rotate the Mac agent token, view the Mac
  agent install command with the token pre-baked.

**Data touched:** Reads/writes: Source, OAuthToken (encrypted),
AgentToken, ImportRun.

**Empty state:** All four sources not connected → first-run
prompts.

**Edge cases:**
- OAuth refresh failure → surfaced as "reconnect required."
- LinkedIn CSV format changes → upload shows parse errors with
  line numbers.

---

## /settings/cadence

**Shows:** Current cadence rules, editable:
- Target outreach per week (integer).
- Personal/business mix (e.g., 60% personal / 40% business).
- Minimum days since last contact.
- **Tag-based rules** (repeating block): "at least N per
  [timeframe] tagged [tag]." Add / remove rows freely.

**User can:** Edit and save rules. Preview effect on this week's
suggestions before saving.

**Data touched:** Reads/writes: CadenceRules.

---

## Mac-side agent (not a page; listed for completeness)

**Purpose:** Read Apple Contacts, iMessage, and call-log data from
the Mac's local databases and push to the web app's ingestion API.

**Behavior:**
- Runs as a LaunchAgent, nightly (and on manual trigger from the
  Mac).
- Reads:
  - Apple Contacts via AddressBook / Contacts framework.
  - iMessage via `~/Library/Messages/chat.db` (read-only).
  - Call log via macOS call-history DB (via Continuity; needs
    Phase 4 verification).
- Sends: incremental diffs since last successful push, over HTTPS,
  authenticated with a rotatable bearer token.
- Failure mode: logs locally, retries with backoff, surfaces status
  at `/settings/sources`.

**Install:** A one-line command from `/settings/sources` copies a
small script + LaunchAgent plist to the user's Mac. Token is
embedded at install time; Robb can rotate without reinstalling.

---

## Cross-page behaviors

- **Freshness Score (v1 metric).** Per-contact score representing
  how "fresh" (recently engaged) vs. "cold" (long dormant) the
  relationship is.
  - **Inputs:** recency and frequency of interactions across all
    diary sources (messages, calls, emails, notes). Simple
    weighted formula in v1 — the goal is a usable signal, not a
    research project.
  - **Output:** a 0–100 number plus a coarse label
    (**Fresh / Warm / Fading / Cold / Dormant**).
  - **Where it appears:** contact header (`/contacts/[id]`),
    contact rows (`/contacts`), suggestion cards (`/suggestions`),
    plan rows on Home.
  - **How it's used in logic:** feeds the `/suggestions`
    candidate ranking alongside cadence rules. Lower freshness →
    higher priority for reaching out.
  - **v2 hook:** v2 is expected to add additional relationship-
    quality metrics. The data model should represent score types
    generically (one current score + history), not hard-code
    "freshness" as the only metric.

- **Relationship Summary rule.** The summary on `/contacts/[id]`
  is a single free-form paragraph describing the relationship in
  plain English. It must NOT include: numeric metrics,
  last-interaction dates, frequency stats, or other structured
  fields Robb can see elsewhere in the header or Diary. LLM-
  generated, cached, regenerated on demand.

- **Authentication:** all pages except `/login` require session.
  Unauthenticated request redirects to `/login`.
- **Global search:** header-mounted search bar on every
  authenticated page; matches contact names and jumps to
  `/contacts/[id]`.
- **Global nav:** persistent left/top nav with entries for Home,
  Contacts, Triage, Merge, Follow-ups, Settings. Counts (merge
  pending, triage pending, follow-ups open) shown as small badges.
- **Toasts/notifications:** background job completions (bulk merge
  done, sync complete, CSV imported) surfaced as dismissible toasts.
- **Keyboard shortcuts:** at minimum `J/K`, `←/→`, `Y/N`, and
  `Enter` for card flows (`/triage`, `/suggestions`). Global:
  `/` to focus search.
- **Feature flags:** none needed in v1.
- **Permissions:** single user; no RBAC.
