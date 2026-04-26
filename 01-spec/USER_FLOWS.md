# USER_FLOWS

> Phase 2, Step 2. The critical paths through the product for Robb.

## Conventions

Each flow lists the pages touched in order, with a one-line note per step.
All flows assume the single user is Robb; "user" below = Robb.

---

## Flow 1: First-run onboarding

The one-time path from empty app to a fully triaged, categorized contact
graph. This is the longest flow in the app and the most important one to
get right — if this stalls, the product dies.

1. **/login** — Sign in (magic link or password).
2. **/** — Lands on empty Home. Empty state says "You haven't connected
   any sources yet. Start here →" pointing to `/settings/sources`.
3. **/settings/sources** — Connect each source:
   - Google Contacts — OAuth.
   - Gmail — OAuth.
   - LinkedIn — upload CSV export.
   - Mac agent — copy the generated API token, run the one-line
     installer command on Mac, agent reports in and starts pushing
     Apple Contacts + iMessage + call logs.
4. **Background** — App ingests all sources into a staging area.
   Builds merge-candidate groups. Toast/notification when ready.
5. **/merge** — User sees bulk-merge list. Confirms all high-
   confidence exact matches via **Bulk merge** (one click, hundreds
   of groups resolved).
6. **Branch choice — post-bulk-merge prompt.** After the bulk merge
   completes, the app shows an explicit two-option prompt:
   **"Start triaging"** (takes Robb to `/triage` with the cleanly-
   merged contacts as the initial pool) or **"Keep merging"** (stays
   on `/merge` to work through ambiguous groups). Robb can switch
   between these any time; ambiguous merges remain a persistent
   punch-list.
7. **/triage** — Card triage begins on the cleanly-merged graph.
   For each contact: Keep (+ category: personal / business / both)
   or Skip. Keyboard-driven. Robb can pause and return later.
   - **Alternative:** `/contacts` bulk-list mode with checkboxes.
     Same state space.
8. **Parallel, anytime:** Robb returns to `/merge` and resolves
   ambiguous groups individually via `/merge/[id]` — approve,
   split, or skip. Resolving a group updates any downstream
   triage/category state on the merged result.
9. **/** — Once triage is meaningfully done (not necessarily 100%
   and not dependent on the ambiguous merge queue being empty),
   Home populates: a pre-loaded suggestion set is ready, the empty
   state turns into "Plan this week →".

**Completion criterion:** Robb has a kept/skipped decision on every
merged contact, each "keep" has a category, and Home shows a live
suggestion set.

---

## Flow 2: Weekly outreach loop (the core recurring flow)

The flow Robb runs every week once onboarded. This is the habit the
product is trying to build.

1. **/** — Opens app. State A: a committed plan exists → skip to
   step 4. State B: no plan yet → sees suggestion preview and
   "Plan this week →" CTA.
2. **/suggestions** — Card flow, pre-filtered by cadence rules
   (recency + personal/business mix from `/settings/cadence`).
   For each card: Reach out / Not this week / Never. Commits the
   "Reach out" set as the week's plan.
3. **/** — Now shows the committed plan: 2–5 people, each with
   status (**not-yet-reached / reached / connected**).
   - **not-yet-reached** — default state.
   - **reached** — Robb has sent something outbound.
   - **connected** — a real exchange happened (reply received,
     call/meeting completed). v1 is manually marked; post-v1 can
     auto-detect.
4. **/contacts/[id]** — Clicks into a person to prep. Reads
   Relationship Summary, scans recent messages, checks LinkedIn
   URL, notes open follow-ups.
5. **External** — Robb reaches out in his own app (iMessage,
   Gmail, phone). App is not in this loop.
6. **/contacts/[id]** or **/** — Robb marks **"Reached out"**
   (single manual click on the home plan or the contact page).
   Optionally logs notes or new follow-ups from the exchange.
   - **v1 scope:** manual marking only, single state ("Reached
     out"). No auto-detection.
   - **Post-v1 direction:** auto-detect outbound messages from
     synced Gmail/iMessage (Option C from brainstorm), and split
     the state into two distinct concepts — **"Reached out"**
     (Robb sent something) and **"Connected"** (a real exchange
     happened, e.g. reply received or call completed). Flagged
     here so v1 data model anticipates this split rather than
     forcing a rewrite later.
7. Repeat steps 4–6 through the week for each person in the plan.
8. **End of week** — Plan auto-archives (kept in contact history
   for future context). Next week starts clean.

---

## Flow 3: Reaching out to one person (ad-hoc, not from weekly plan)

Robb thinks of a specific person and wants to act.

1. **/** or **/contacts** — Searches by name (global search in
   header, or filter in bulk list).
2. **/contacts/[id]** — Lands on contact page. Uses Relationship
   Summary + history + LinkedIn URL for context.
3. **Optional — "Add to this week":** a button on the contact
   page appends this person to the current week's plan so they
   appear on `/` and get tracked through
   not-yet-reached → reached → connected.
4. **External** — Reaches out in his own app.
5. **/contacts/[id]** — Logs a note or follow-up if needed, marks
   reached/connected if added to the plan.

---

## Flow 4: Handling follow-ups

1. **/follow-ups** — Opens the global follow-up inbox. Items
   sorted by age or contact.
2. For each item: **Mark done**, **Snooze**, or **Open contact →**.
3. **/contacts/[id]** (via Open contact) — Acts on the follow-up
   in context, then marks it done from the contact page.

---

## Flow 5: Ongoing contact ingestion (post-onboarding)

Background flow, not user-initiated, but user-visible.

1. **Background, nightly** — Mac agent pushes new iMessages, new
   call-log entries, and any new/changed Apple Contacts. Gmail and
   Google Contacts sync on the same cadence via OAuth.
2. **App** — New contacts enter a small to-triage queue. Updates
   to existing contacts flow into their history.
3. **/** — If any new contacts are waiting, a subtle banner:
   "12 new contacts to triage →" linking to `/triage`.
4. **/triage** or **/contacts** (filter: to-triage) — Robb triages
   the newcomers in whichever mode he prefers. Can be done in 30
   seconds; doesn't block the weekly loop.
5. **/merge** — If the sync produced new merge candidates,
   surfaced on Home the same way. Merged before triage if possible.

---

## Flow 6: Custom tags

Tags are user-defined labels that sit alongside the fixed category
(personal / business / both) and let Robb group contacts however he
wants — `byu-volleyball`, `angel-investors`, `college-friends`, etc.
A contact can have many tags.

1. **/contacts/[id]** — Tag chip picker on the contact page. Robb
   adds an existing tag by typing it, or creates a new one inline
   (type name → press enter → tag is created and applied).
2. **/contacts** — Bulk list filter includes a **tag** filter.
   Bulk list also supports bulk-tagging via checkboxes + an "Add
   tag" action, so Robb can tag 15 teammates in one pass.
3. **/settings/cadence** — Cadence rules can reference tags, e.g.
   "reach out to 2 `byu-volleyball` contacts per month" alongside
   or instead of the simple personal/business ratio.
4. **/suggestions** — Suggestion pool respects tag-based cadence
   rules when filling the weekly set.

No dedicated tag-management page in v1 (no `/settings/tags`). Tag
creation happens inline on the contact page; renames and deletes
can happen later — low-frequency ops.

---

## Flow 7: Settings / account management

1. **/settings** — Entry hub.
2. **/settings/sources** — Reconnect a disconnected OAuth, rotate
   the Mac agent API token, check last-sync timestamps per source,
   manually re-trigger a sync.
3. **/settings/cadence** — Tune weekly cadence: how many people
   per week, personal/business ratio, minimum recency threshold.

---

## Pages not covered by any flow

Cross-check against SITEMAP.md:

- All 8 authenticated pages + `/login` are touched by at least one
  flow above. No orphans.
