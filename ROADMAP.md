# ROADMAP — net-work v1

> Implementation plan for Phase 4. Single source of truth for progress.
> Tasks use checkbox syntax (`- [ ]`) so they can be checked off as we go.

**Goal:** Ship Robb's personal CRM v1 in 7 days — contact ingest from 5 sources, merge, triage, weekly outreach plan, per-contact diary view.

**Architecture:** Next.js 15 App Router on Vercel + Postgres (Supabase) + a Python Mac-side agent that runs as a LaunchAgent. Single-user app with magic-link auth. All five chosen page mockups in `02-design/mockups/*/chosen.html` are the visual contract. All 25+ entities in `01-spec/DATA_MODEL.md` are the schema contract.

**Tech Stack:**
- **Web:** Next.js 15 (App Router, RSC), TypeScript, Tailwind v4, Geist + Source Serif 4 + JetBrains Mono fonts (Google Fonts), Lucide React for icons.
- **Auth:** Supabase Auth (magic link, single user).
- **DB:** Supabase Postgres + Drizzle ORM.
- **Hosting:** Vercel (web), Supabase (DB + Auth).
- **LLM:** OpenRouter (default model **DeepSeek V4**; fallbacks Llama 3.3 70B, Kimi 2.5). Open-source, OpenAI-compatible API. Model is configurable via the `OPENROUTER_MODEL` env var so we can swap without code changes.
- **Mac agent:** Python 3.11+, sqlite3 (read iMessage/Call History DBs), AddressBook framework via `pyobjc`, requests for HTTPS.
- **Testing:** Vitest for unit tests (utility / scoring functions). Manual QA per milestone for UI.

**What this plan covers:** v1 build. Milestones 1–7 ship the BRIEF's "v1 done when" checklist. Outcome metrics (habit / reconnection / reflex) are post-ship.

---

## Pre-flight — accounts & secrets Robb needs to provide

Before code can begin. I'll guide him through each on day 1.

- [x] **Vercel account** — Robb signs in with GitHub.
- [x] **Supabase project** — created free tier; Robb provides project URL + anon key + service role key.
- [x] **Google Cloud project** with OAuth client (Web app type) — for Google Contacts / Gmail / Calendar OAuth. Redirect URI: `https://<vercel-url>/api/auth/google/callback`.
- [x] **OpenRouter API key** (sign-in via GitHub at openrouter.ai, top up $5 credit — at v1 volume that lasts months).
- [x] **GitHub repo** initialized; Robb invites Vercel.
- [x] **`.env.local`** populated locally with all the above.

---

## Project state

- **Current phase:** Phase 4 (Build) — Milestones 1–3 complete; M4 (Merge) is next.
- **Last updated:** 2026-04-27.
- **Next action:** Begin Milestone 4 — auto-grouped merge candidates + bulk-merge UI.

---

## File structure (target)

```
.
├── ROADMAP.md                       (this file)
├── 00-discovery/, 01-spec/, 02-design/   (artifacts — already locked)
├── 03-build/                        (built code lives here)
│   ├── web/                         (Next.js app)
│   │   ├── app/                     (App Router pages)
│   │   ├── components/              (React components)
│   │   ├── lib/                     (utilities, integrations, scoring)
│   │   ├── db/                      (Drizzle schema + migrations)
│   │   ├── tests/                   (Vitest)
│   │   └── public/
│   └── mac-agent/                   (Python agent)
│       ├── agent.py                 (entry point)
│       ├── readers/                 (apple_contacts, imessage, call_log)
│       ├── pusher.py                (HTTPS to web)
│       ├── installer.sh             (one-line install)
│       └── net.work.agent.plist     (LaunchAgent definition)
└── README.md                        (project root readme — already exists)
```

**Key rule:** keep web app files focused. One responsibility per file. Component files ≤ 250 lines; route handlers ≤ 150.

---

# Milestone 1 — Scaffolding + first end-to-end slice

**Goal:** A deployable Next.js app on Vercel where Robb can sign in via magic link, see an empty Home page with the locked Brass design system, and the database has the full schema migrated. Smallest possible end-to-end slice.

**Demo criterion:** Visit production URL → sign in with magic link → land on Home → see the empty-state version of the locked `home/chosen.html` design (no real data yet, but design system is visibly correct).

### Files in this milestone

- Create: `03-build/web/package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.js`, `.env.example`
- Create: `03-build/web/app/layout.tsx`, `app/page.tsx`, `app/globals.css`
- Create: `03-build/web/components/AppShell.tsx`, `components/TopBar.tsx`, `components/IconNav.tsx`
- Create: `03-build/web/lib/design-tokens.ts` (re-exports the brand tokens as TS constants)
- Create: `03-build/web/db/schema.ts` (full Drizzle schema)
- Create: `03-build/web/db/migrations/0001_initial.sql` (auto-generated)
- Create: `03-build/web/lib/db.ts` (Drizzle client)
- Create: `03-build/web/lib/auth.ts` (Supabase auth helpers)
- Create: `03-build/web/middleware.ts` (auth gate)
- Create: `03-build/web/app/login/page.tsx`
- Create: `03-build/web/app/api/auth/callback/route.ts`

### Tasks

- [x] **1.1 Initialize Next.js + TypeScript + Tailwind v4** in `03-build/web/`. Add Geist, Source Serif 4, JetBrains Mono via `next/font/google`. Run `pnpm dev` locally to confirm it serves a blank page.
- [x] **1.2 Port design tokens.** Translate the OKLCH/hex palette, freshness traffic-light tokens, 10 avatar colors, type scale, motion tokens from `02-design/DESIGN_SYSTEM.md` into `lib/design-tokens.ts` as exported TS constants AND into `app/globals.css` as `:root` CSS custom properties. Both light and dark variants. Confirm against the locked mockups.
- [x] **1.3 Build the AppShell components** (`AppShell.tsx`, `TopBar.tsx`, `IconNav.tsx`) lifted directly from the locked `home/chosen.html` markup — full-width search bar topbar, 64px icon rail with This-week/Contacts/Triage/Merge/Follow-ups + Settings. Click-through to placeholder pages.
- [x] **1.4 Set up Supabase project.** Robb creates project, gives URL + keys; I write them into `.env.example` as placeholders.
- [x] **1.5 Set up Drizzle ORM.** Install `drizzle-orm`, `drizzle-kit`, `postgres`. Create `lib/db.ts`.
- [x] **1.6 Write the full schema** in `db/schema.ts` — every entity from `01-spec/DATA_MODEL.md`: User, Session, Source, OAuthToken, AgentToken, ImportRun, RawContact, Contact, MergeCandidate, Tag, ContactTag, FollowUp, Note, Message, MessageThread, Email, EmailThread, CallLog, CalendarEvent, RelationshipSummary, Score, ScoreHistory, WeeklyPlan, WeeklyPlanItem, CadenceRules, TagCadenceRule, SuggestionState. Include all enums, FKs, indexes, soft-delete columns. Encrypt OAuth/agent tokens via `pgcrypto` extension.
- [x] **1.7 Generate and run the initial migration** against the Supabase Postgres. Confirm via `psql` that all tables exist.
- [x] **1.8 Implement magic-link auth** with Supabase. `app/login/page.tsx` shows email input + "Send link" button styled per design system. Callback route at `app/api/auth/callback/route.ts`. `middleware.ts` redirects unauthenticated users to `/login`.
- [x] **1.9 Bootstrap the User row.** On first sign-in for Robb's email, create a User record with `timezone: 'America/Los_Angeles'`. Hard-fail any email that isn't his (single-user enforcement).
- [x] **1.10 Build empty-state Home page** at `app/page.tsx` — the State A "no plan committed" empty state from `home/chosen.html`. Hardcoded greeting + "Connect a data source →" CTA. Verify it visually matches the chosen mockup (using only the design tokens, no inline colors).
- [x] **1.11 Deploy to Vercel.** Connect repo, set env vars, deploy. Confirm production URL serves the login page.
- [x] **1.12 End-to-end smoke test.** Robb signs in via magic link in production → lands on Home empty state → page passes a visual diff against `home/chosen.html` (eyeballed, not pixel-perfect).
- [x] **1.13 Commit + tag `m1-scaffolding`.**

**Verification:** Robb can log into the production app, navigates pages via the icon rail (other pages still placeholder), Home looks like the chosen mockup. DB has every table. Magic-link auth works.

---

# Milestone 2 — Contact ingestion (web-side OAuth + LinkedIn CSV)

**Goal:** All web-OAuth sources working: Google Contacts, Gmail, Google Calendar. LinkedIn CSV upload. RawContact rows populated. `/settings/sources` shows last-sync time per source.

**Demo criterion:** From `/settings/sources`, Robb clicks "Connect Google Contacts" → completes OAuth → sees a "Last synced: just now · 218 records" timestamp. Same for Gmail (no message body sync yet — just contact metadata from From/To headers) and Google Calendar (events that have at least one matched email). LinkedIn CSV upload accepts a real LinkedIn export and populates RawContact rows.

### Files in this milestone

- Create: `03-build/web/app/settings/page.tsx`, `app/settings/sources/page.tsx`
- Create: `03-build/web/app/api/auth/google/[action]/route.ts` (start, callback)
- Create: `03-build/web/lib/google.ts` (OAuth client + token refresh)
- Create: `03-build/web/lib/sync/google-contacts.ts`
- Create: `03-build/web/lib/sync/gmail.ts`
- Create: `03-build/web/lib/sync/google-calendar.ts`
- Create: `03-build/web/lib/sync/linkedin-csv.ts` (CSV parser → RawContact rows)
- Create: `03-build/web/app/api/sync/[source]/route.ts` (manual trigger endpoint)
- Create: `03-build/web/app/api/upload/linkedin/route.ts` (file upload handler)

### Tasks

- [x] **2.1 Build `/settings` and `/settings/sources` pages** matching the design system. Cards for each source with status / last-sync / connect-disconnect / manual-sync.
- [x] **2.2 Implement Google OAuth flow** — single auth code grants access to Contacts + Gmail readonly + Calendar readonly scopes. Tokens stored encrypted in `OAuthToken`.
- [x] **2.3 Sync Google Contacts** — paginate the People API, normalize names/emails/phones/photo URL/LinkedIn URL (if present in custom field), upsert RawContact rows by `external_id`.
- [x] **2.4 Sync Gmail headers** — query last 2 years of threads, per-thread store From/To/Cc/Subject/Date and a 2KB body preview. RawContacts created from any new email addresses encountered. Email + EmailThread rows populated.
- [x] **2.5 Sync Google Calendar** — query last 2 years of events with attendees. CalendarEvent rows created and linked to existing RawContacts by attendee email; events with no matched contact are skipped.
- [x] **2.6 LinkedIn CSV uploader** — parse the standard LinkedIn export format (First, Last, Email, Company, Position, Connected On, URL). Each row → RawContact with `source_id` = LinkedIn. Show parse errors with line numbers in the UI.
- [x] **2.7 ImportRun tracking** — wrap each sync in an `ImportRun` row capturing started_at / finished_at / records_seen / errors. Surface last-sync time on `/settings/sources`.
- [x] **2.8 Manual sync button** per source. Calls `POST /api/sync/[source]`.
- [x] **2.9 Token refresh** logic — when a Google token expires, refresh and retry; if refresh fails, mark source `needs_reauth`.
- [x] **2.10 Smoke test on real data.** Robb connects his real Google account; ingest at least 200 contacts and 1000 emails. Confirm RawContact / Email / EmailThread / CalendarEvent rows look right via direct DB query.
- [x] **2.11 Commit + tag `m2-web-ingest`.**

**Verification:** `/settings/sources` shows 4 connected sources with realistic record counts. RawContact has hundreds of rows. No raw email *bodies* are stored yet beyond a 2KB preview.

---

# Milestone 3 — Mac-side agent (Apple Contacts + iMessage + Call History)

**Goal:** A Python script Robb installs on his Mac that nightly pushes Apple Contacts, iMessage messages + threads, and Call History entries to the web app's ingestion API.

**Demo criterion:** From `/settings/sources`, Robb copies a one-line install command, runs it in his terminal, and within 60 seconds the Mac agent has pushed his Apple Contacts and recent iMessages to the database. The agent registers as a LaunchAgent and re-runs nightly at 02:00 local.

### Files in this milestone

- Create: `03-build/mac-agent/agent.py` (entry, orchestration)
- Create: `03-build/mac-agent/readers/apple_contacts.py` (uses `pyobjc` AddressBook framework)
- Create: `03-build/mac-agent/readers/imessage.py` (reads `~/Library/Messages/chat.db`)
- Create: `03-build/mac-agent/readers/call_history.py` (reads `~/Library/Application Support/CallHistoryDB/CallHistory.storedata` if present)
- Create: `03-build/mac-agent/pusher.py` (incremental diff → HTTPS POST)
- Create: `03-build/mac-agent/state.json` (last-run watermarks per reader)
- Create: `03-build/mac-agent/installer.sh` (curl-friendly install)
- Create: `03-build/mac-agent/net.work.agent.plist` (LaunchAgent template)
- Create: `03-build/web/app/api/ingest/[kind]/route.ts` (web-side endpoints: contacts | messages | calls)
- Create: `03-build/web/lib/ingest/apple_contacts.ts`, `lib/ingest/imessage.ts`, `lib/ingest/call_log.ts`

### Tasks

- [x] **3.1 Investigate macOS Continuity call-history availability.** Verify on Robb's Mac whether `CallHistory.storedata` exists with iPhone calls. If not present, log + report; call-log support is best-effort for v1. (BRIEF flagged this risk.)
- [x] **3.2 Implement Apple Contacts reader** via `pyobjc` AddressBook — emit list of `{external_id, name, phones, emails, photo_b64}` dicts.
- [x] **3.3 Implement iMessage reader.** Read `chat.db`, group messages into threads using **8-hour gap rule** in Python (matches DATA_MODEL spec), emit per-message + per-thread payloads. Watermark by `ROWID`.
- [x] **3.4 Implement Call History reader** if available. Watermark by `ZDATE`.
- [x] **3.5 Build pusher** — batches of 200 records per POST, signed with a bearer token, exponential backoff on 5xx, idempotent (web-side dedupes by `external_id`).
- [x] **3.6 Build web-side ingestion endpoints** at `app/api/ingest/contacts`, `/messages`, `/calls`. Authenticate by `AgentToken.token_hash`. Validate payload shape. Upsert into RawContact / Message / MessageThread / CallLog.
- [x] **3.7 Build the agent installer.** `installer.sh` clones the agent repo, creates a venv, installs deps (`pyobjc`, `requests`), drops the LaunchAgent plist into `~/Library/LaunchAgents`, registers it with `launchctl bootstrap`. The token is templated into the plist at install time.
- [x] **3.8 Surface install command on `/settings/sources`** — generate a fresh `AgentToken`, render a one-line `curl ... | bash` install command Robb can paste, hide it after first install completes.
- [x] **3.9 Surface agent status** on `/settings/sources` — last push timestamp, agent hostname, pending records.
- [x] **3.10 Wire iMessage threads to RawContact matching by phone.** A message arrives for `+14155550142` → look up RawContact with that phone → link Message.contact_id. Unmatched messages remain dangling and re-link on later sync.
- [x] **3.11 Smoke test end-to-end.** Robb runs the installer; within a minute his Apple Contacts (likely the largest single source) appear. Within 5 minutes iMessage history is pushed.
- [x] **3.12 Commit + tag `m3-mac-agent`.**

**Verification:** RawContact count jumps after Apple Contacts pushes. Message + MessageThread tables populated. `chat.db` reads are read-only. Agent runs nightly via LaunchAgent.

---

# Milestone 4 — Merge engine + `/merge` UI

**Goal:** Auto-grouped merge candidates with confidence tiers; bulk-merge for exact + high; `/merge` page works as in the chosen mockup; `/merge/[id]` for ambiguous review; manual merge.

**Demo criterion:** After M3, RawContact has hundreds-to-thousands of records across sources. From `/merge`, Robb clicks "Merge 38 groups" and Contact rows are created (linked to all RawContacts in each group). Ambiguous groups stay on the page for individual review.

### Files in this milestone

- Create: `03-build/web/lib/merge/dedupe.ts` (grouper)
- Create: `03-build/web/lib/merge/confidence.ts` (Exact / High / Ambiguous logic)
- Create: `03-build/web/lib/merge/apply.ts` (commit a merge → Contact + RawContact.contact_id update)
- Create: `03-build/web/app/merge/page.tsx` (matches `merge/chosen.html`)
- Create: `03-build/web/app/merge/[id]/page.tsx`
- Create: `03-build/web/app/api/merge/[action]/route.ts` (bulk-merge, single-merge, split, manual)
- Create: `03-build/web/tests/merge.test.ts` (Vitest — confidence + apply)

### Tasks

- [ ] **4.1 Write Vitest tests for confidence tiers** with fixture RawContacts: exact email match → Exact; phone match no email match → High; name overlap with no shared identifier → Ambiguous; name + LinkedIn match → High.
- [ ] **4.2 Implement `confidence.ts`** to make tests pass. Pure function over `RawContact[]`.
- [ ] **4.3 Implement `dedupe.ts`** — runs over all unmerged RawContacts, produces MergeCandidate rows. Idempotent re-run (don't recreate already-pending or resolved groups).
- [ ] **4.4 Implement `apply.ts`** — given a MergeCandidate, create a Contact row, set `RawContact.contact_id` for all members, set `MergeCandidate.status = approved`, set `resulting_contact_id`. Conflict resolution: most recent wins for fields, but per-field overrides allowed.
- [ ] **4.5 Build `/merge` page** matching `merge/chosen.html` — hero stats, dark CTA card, ready-to-merge single-column list, "need a closer look" single-column spread.
- [ ] **4.6 Implement bulk-merge endpoint** that processes 38+ groups in one transaction with a progress toast.
- [ ] **4.7 Build `/merge/[id]` page** — side-by-side per-field diff for ambiguous groups, Approve / Split / Skip buttons.
- [ ] **4.8 Manual merge flow** — search two contacts → combine. Reachable from a "+ Manual merge" hero button.
- [ ] **4.9 Run dedupe on Robb's real data.** Verify the suggested groups look sane.
- [ ] **4.10 Commit + tag `m4-merge`.**

**Verification:** Robb runs through merge, ends up with hundreds of Contact rows linked to thousands of RawContacts. `/merge` is empty (or only ambiguous groups remain).

---

# Milestone 5 — Triage flow + `/contacts` bulk list

**Goal:** Onboarding triage works (one card at a time, keep/skip with category prompt). `/contacts` bulk list works with checkboxes and bulk actions. Contacts get a kept/skipped status and category.

**Demo criterion:** Robb opens `/triage`, swipes through 50–100 Contacts, ends up with a categorized "kept" pool. He can also use `/contacts` bulk-list mode to scan and check boxes.

### Files in this milestone

- Create: `03-build/web/app/triage/page.tsx` (matches `triage/chosen.html`)
- Create: `03-build/web/app/contacts/page.tsx` (matches `contacts/chosen.html` — Option B locked)
- Create: `03-build/web/components/TriageCard.tsx`
- Create: `03-build/web/components/ContactRow.tsx`
- Create: `03-build/web/components/FreshnessRing.tsx` (canonical component used everywhere)
- Create: `03-build/web/components/Avatar.tsx` (with deterministic 10-color palette via contact ID hash)
- Create: `03-build/web/lib/avatar-color.ts` (deterministic hash → av-1..av-10)
- Create: `03-build/web/app/api/triage/decision/route.ts`
- Create: `03-build/web/app/api/contacts/bulk/route.ts` (bulk: keep, skip, add tag, add to this week, etc.)

### Tasks

- [ ] **5.1 Build `Avatar` component** — photo if available, otherwise italic Source Serif initials on a deterministic-color background from `lib/avatar-color.ts`. Unit-test the hash so the same contact always gets the same color.
- [ ] **5.2 Build `FreshnessRing`** — SVG ring with thicker stroke (5px / 6px / 8px depending on size), label below, traffic-light coloring per band. Used on Home, Contact Detail, Triage, Contacts.
- [ ] **5.3 Build `TriageCard`** matching `triage/chosen.html` — avatar, name, meta-row, source badges, signals strip, recent history preview, Skip/Keep buttons + keyboard shortcuts (← → Z).
- [ ] **5.4 Build `/triage` page** — pulls one un-triaged Contact at a time, renders the card. On Keep, prompt for category (P/B/X), then advance. Save decisions to `Contact.triage_status` and `Contact.category`.
- [ ] **5.5 Build `ContactRow`** matching `contacts/chosen.html` (Option B locked) — checkbox, avatar, name + email, category chip, tags, freshness ring, last-seen.
- [ ] **5.6 Build `/contacts` page** with persistent left filter sidebar (Status / Category / Recency / Tags / Source), virtualized row list, bulk-action toolbar.
- [ ] **5.7 Implement bulk-action endpoints** — keep (with category), skip, add tag, add to this week's plan, re-categorize.
- [ ] **5.8 End-to-end test.** Robb triages 100+ contacts via the card flow and 100+ via bulk list. Both write the same state.
- [ ] **5.9 Commit + tag `m5-triage`.**

**Verification:** "kept" pool is meaningfully populated with categories. `/contacts` lists them with working filters and bulk actions.

---

# Milestone 6 — Contact Detail + Diary + Freshness scoring + Relationship Summary

**Goal:** `/contacts/[id]` matches the locked chosen design. Diary aggregates all sources chronologically with thread summarization. Freshness scores computed per contact. Relationship Summary generated by an open-source LLM via OpenRouter.

**Demo criterion:** Robb opens any kept Contact's page and sees the editorial hero, action buttons (Call/Text/Email/LinkedIn dial out correctly), Relationship Summary as a real LLM-generated paragraph, Open Follow-ups (manually-added), full chronological Diary with thread summaries, Sources & merge history.

### Files in this milestone

- Create: `03-build/web/app/contacts/[id]/page.tsx` (matches `contact-detail/chosen.html`)
- Create: `03-build/web/components/DiaryEntry.tsx`
- Create: `03-build/web/components/DiaryModal.tsx` (word-for-word view)
- Create: `03-build/web/lib/diary.ts` (aggregator across Message/Email/Call/Calendar/Note)
- Create: `03-build/web/lib/threading.ts` (8-hour gap rule for iMessage thread reconstruction on the web side too)
- Create: `03-build/web/lib/scoring/freshness.ts`
- Create: `03-build/web/lib/llm/client.ts` (OpenRouter client wrapper, model configurable via `OPENROUTER_MODEL` env var)
- Create: `03-build/web/lib/llm/summary.ts` (uses `client.ts`; exports `summarizeThread`, `summarizeRelationship`)
- Create: `03-build/web/app/api/contacts/[id]/[action]/route.ts` (regenerate-summary, set-tag, etc.)
- Create: `03-build/web/tests/freshness.test.ts`

### Tasks

- [ ] **6.1 Implement `freshness.ts`** — recency- and frequency-weighted formula producing a 0–100 score and a band (Fresh / Warm / Fading / Cold / Dormant). Test with fixtures.
- [ ] **6.2 Background job** to compute Freshness Scores nightly + on-demand after a sync. Writes to `Score` table (kind=`freshness`) with one current row + ScoreHistory.
- [ ] **6.3 Implement `lib/llm/client.ts` and `lib/llm/summary.ts`.** Client wraps OpenRouter (OpenAI-compatible SDK works). Summary module exports `summarizeThread(thread)` (2–3 sentences) and `summarizeRelationship(contactId)` (single paragraph from full history + notes). System prompt isolated and short for cache reuse. Quality target: summaries that read naturally and don't editorialize. **Default model: DeepSeek V4.** If output is unsatisfying, swap to Llama 3.3 70B or Kimi 2.5 via the `OPENROUTER_MODEL` env var — no code change.
- [ ] **6.4 Trigger thread summary generation** lazily on first view of the Diary, then cache. Also background-job common ones.
- [ ] **6.5 Trigger relationship summary on Contact creation** + manual regenerate button.
- [ ] **6.6 Implement `lib/diary.ts`** — pulls Message/MessageThread, Email/EmailThread, CallLog, CalendarEvent, Note for a given contact, returns a unified chronological list with summaries.
- [ ] **6.7 Build `/contacts/[id]` page** matching `contact-detail/chosen.html` exactly: editorial hero, action bar with Reached/Connected check circles, Relationship Summary, Open Follow-ups, Diary, Sources & merge history.
- [ ] **6.8 Build `DiaryModal`** — clicking a thread shows the full word-for-word messages or email body in an overlay.
- [ ] **6.9 Add notes + follow-ups** — inline create on the contact page.
- [ ] **6.10 Wire up the "Add to this week" button** (no-op until Milestone 7 ships WeeklyPlan).
- [ ] **6.11 Smoke test on Sarah Kauffman or any real contact.** Verify: photo or avatar correct, action links dial out, freshness ring shows the right color/number, summary reads naturally, diary shows real data.
- [ ] **6.12 Commit + tag `m6-contact-detail`.**

**Verification:** A random kept contact's page is genuinely useful — Robb can read it before reaching out and feel he knows the relationship.

---

# Milestone 7 — Weekly plan + Home + Suggestions + Cadence + Final polish

**Goal:** Home page populates from a real WeeklyPlan. Sunday-morning planning flow works. Cadence rules tunable. App is fully usable end-to-end.

**Demo criterion:** Robb opens the app on Sunday morning, sees no plan committed → clicks "Plan this week" → goes through `/suggestions` (card flow) → commits 5 contacts → returns to Home → sees them with not-yet-reached/reached/connected check circles. Cadence rules (`/settings/cadence`) actually drive the suggestion pool.

### Files in this milestone

- Create: `03-build/web/app/suggestions/page.tsx` (follows `/triage` pattern)
- Create: `03-build/web/app/settings/cadence/page.tsx`
- Create: `03-build/web/lib/suggestions/candidates.ts` (cadence-aware ranking)
- Create: `03-build/web/lib/weekly-plan.ts` (commit + ISO-week math)
- Create: `03-build/web/app/api/weekly-plan/[action]/route.ts`
- Create: `03-build/web/app/follow-ups/page.tsx` (follows `/contacts` pattern)
- Modify: `app/page.tsx` to render the real Home (State A and B logic)

### Tasks

- [ ] **7.1 Implement `weekly-plan.ts`** — ISO-week calculation in user timezone, plan creation, item add/remove, status transitions (not_yet_reached → reached → connected), auto-archive on Monday 00:00 local.
- [ ] **7.2 Implement `candidates.ts`** — produces a ranked candidate list using freshness, recency since last contact, category mix from cadence, and tag-based rules. Excludes `suggestion_status = 'never'` and contacts already in the current week's plan.
- [ ] **7.3 Build `/suggestions` page** following the `/triage` card pattern — Reach out / Not this week / Never decisions; Commit Plan button writes WeeklyPlan + WeeklyPlanItems.
- [ ] **7.4 Build `/settings/cadence`** — target per week, personal/business mix, min days since last contact, repeating tag-based rules block.
- [ ] **7.5 Build the real Home page** matching `home/chosen.html` — State A (plan committed) and State B (no plan yet, primed suggestion preview).
- [ ] **7.6 Wire "Add to this week"** from `/contacts/[id]` to append to current WeeklyPlan.
- [ ] **7.7 Build `/follow-ups`** following the `/contacts` list pattern — global open follow-ups across all contacts, filter/snooze/done.
- [ ] **7.8 Polish pass.** Run through every page; fix visual mismatches; check empty states; verify keyboard shortcuts; verify mobile responsiveness on iPhone Safari for read-only browsing (full mobile UX is post-v1, but it shouldn't be unusable).
- [ ] **7.9 Production smoke test.** Robb does a full Sunday-morning loop in production: plan → reach out → mark reached → mark connected → next week.
- [ ] **7.10 Commit + tag `m7-v1`.**

**Verification:** Robb can run the full weekly loop without any DB fiddling. v1 is shippable.

---

## Post-v1 backlog (NOT in scope)

Listed so they don't accidentally creep in:
- iOS app
- In-app call recording / transcription (Granola-style)
- Auto-detection of "reached out" / "connected" from synced outbound messages
- AI-drafted message suggestions
- LinkedIn scraping / Chrome extension
- Cadence-from-calendar (free/busy)
- Multi-tenant productization
- Contact merge un-merge full UI
- Score types beyond freshness

---

## Working agreement

- **Daily check-in:** I report what's done at the end of each milestone. Robb verifies on production. We don't move to the next milestone until the previous demo criterion passes.
- **TDD where it matters:** Write tests first for `confidence.ts`, `freshness.ts`, `threading.ts`, `weekly-plan.ts`, `avatar-color.ts`, and `candidates.ts` — anything with non-trivial logic. Skip unit tests for thin glue code; rely on the per-milestone smoke test.
- **Commits:** every meaningful unit of work, with conventional-commit messages (`feat:`, `fix:`, `chore:`, `test:`).
- **No scope creep.** If a feature isn't in this plan and isn't a bug, it goes in `Post-v1 backlog`. If something is missing that *should* be in v1, we discuss before adding.
- **If a Phase 2/3 artifact contradicts the build:** stop, fix the artifact first, re-approve, then continue (per WORKFLOW.md).
