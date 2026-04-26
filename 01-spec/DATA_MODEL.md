# DATA_MODEL

> Phase 2, Step 4. Entities, properties, relationships. Plain English.
>
> Every entity implicitly has: `id`, `created_at`, `updated_at`.

## Conventions

- Types are described in plain English; Phase 4 translates to SQL.
- "Robb" = the single v1 user. Schema still includes `user_id` FKs
  for productization hygiene.
- Soft-delete (`deleted_at`) on user-editable entities that carry
  history (Contact, Note, FollowUp, Tag). Raw source records
  (Message, Email, CallLog, CalendarEvent, RawContact) are not
  soft-deleted — they're rebuildable from source.

---

## User

The single app user.

**Properties:**
- `email` — string, unique, required
- `name` — string
- `timezone` — string (IANA, e.g. `America/Los_Angeles`) — used
  for ISO-week rollover at Monday 00:00 local.

---

## Session

Authenticated session record.

**Properties:**
- `user_id` — FK → User
- `token_hash` — string
- `expires_at` — timestamp

---

## Source

One row per data source. Static-ish seed set: `apple_contacts`,
`google_contacts`, `gmail`, `google_calendar`, `linkedin_csv`,
`mac_agent`.

**Properties:**
- `user_id` — FK → User
- `kind` — enum: the values above
- `status` — enum: `not_connected` / `connected` / `needs_reauth` / `error`
- `last_sync_at` — timestamp, nullable
- `last_sync_error` — string, nullable
- `config` — JSON (source-specific metadata, e.g. Gmail account
  email, Mac agent hostname)

---

## OAuthToken

OAuth credentials for OAuth-based sources.

**Properties:**
- `source_id` — FK → Source
- `access_token` — string, encrypted at rest
- `refresh_token` — string, encrypted at rest
- `expires_at` — timestamp
- `scopes` — string[] (for narrow-scope verification, esp. Calendar)

---

## AgentToken

Bearer token for the Mac-side agent's ingestion API.

**Properties:**
- `source_id` — FK → Source (kind = `mac_agent`)
- `token_hash` — string (hash only; plaintext shown once at
  creation then discarded)
- `revoked_at` — timestamp, nullable
- `last_seen_at` — timestamp, nullable

---

## ImportRun

One record per sync attempt. Used for history + debugging at
`/settings/sources`.

**Properties:**
- `source_id` — FK → Source
- `started_at` / `finished_at` — timestamps
- `status` — enum: `running` / `success` / `partial` / `failed`
- `records_seen` / `records_new` / `records_updated` — ints
- `error_message` — string, nullable

---

## RawContact

A single contact record from a single source, *before* merge. Kept
so re-merge is possible and unmerge works.

**Properties:**
- `source_id` — FK → Source
- `external_id` — string (source-native ID; iCloud UID, Google
  resource name, LinkedIn row index, iMessage handle, etc.)
- `payload` — JSON (raw fields as pulled)
- `name` / `emails[]` / `phones[]` / `linkedin_url` / `avatar_url`
  — normalized extracts for matching
- `contact_id` — FK → Contact, nullable (null until merged)

---

## Contact

A merged person. The primary entity of the app.

**Properties:**
- `user_id` — FK → User
- `display_name` — string
- `photo_url` — string, nullable
- `primary_phone` / `primary_email` — strings, nullable
- `linkedin_url` — string, nullable (from LinkedIn CSV or manual)
- `category` — enum: `personal` / `business` / `both`, nullable
  until triaged
- `triage_status` — enum: `to_triage` / `kept` / `skipped`
- `suggestion_status` — enum: `active` / `never`
  (`never` = permanently excluded from `/suggestions` per user
  choice; requires explicit re-activation on the contact page)
- `merge_notes` — string, nullable (why these records were
  merged; useful for unmerge UX)
- `deleted_at` — timestamp, nullable

**Relationships:**
- Has many RawContact (via `contact_id`)
- Has many Tag (via ContactTag)
- Has many FollowUp, Note, Message, Email, CallLog, CalendarEvent
- Has many Score
- Has one current RelationshipSummary (latest)

---

## MergeCandidate

A suggested merge group produced by the deduper, not yet acted on.

**Properties:**
- `user_id` — FK → User
- `raw_contact_ids` — int[] (2+ RawContacts the deduper thinks are
  the same person)
- `confidence` — enum: `exact` / `high` / `ambiguous`
- `signals` — JSON (what matched: name, phone, email, etc.)
- `status` — enum: `pending` / `approved` / `split` / `skipped`
- `resolved_at` — timestamp, nullable
- `resulting_contact_id` — FK → Contact, nullable (set when
  approved)

**Notes:**
- Re-run of the deduper should not create duplicate pending
  groups for the same unresolved set.

---

## Tag

User-defined label.

**Properties:**
- `user_id` — FK → User
- `name` — string, unique per user
- `color` — string, optional
- `deleted_at` — timestamp, nullable

---

## ContactTag

Join table, many-to-many.

**Properties:**
- `contact_id` — FK → Contact
- `tag_id` — FK → Tag
- Unique on (contact_id, tag_id)

---

## FollowUp

Action item for Robb related to a contact.

**Properties:**
- `contact_id` — FK → Contact
- `text` — string (the thing to do)
- `source` — enum: `manual` / `extracted` (surfaced from
  message history; v1 sets `manual` only, but enum leaves room)
- `status` — enum: `open` / `done` / `snoozed`
- `snooze_until` — timestamp, nullable
- `done_at` — timestamp, nullable
- `deleted_at` — timestamp, nullable

---

## Note

Free-form timestamped note Robb writes on a contact.

**Properties:**
- `contact_id` — FK → Contact
- `body` — text
- `deleted_at` — timestamp, nullable

---

## Message

One iMessage/SMS message from the Mac agent.

**Properties:**
- `contact_id` — FK → Contact, nullable (unmatched messages still
  ingested; re-match on merge)
- `thread_id` — FK → MessageThread
- `external_id` — string (iMessage GUID or similar)
- `direction` — enum: `inbound` / `outbound`
- `sent_at` — timestamp
- `body` — text
- `channel` — enum: `imessage` / `sms`

---

## MessageThread

A conversational cluster built from Messages using the **8-hour
gap rule** (a gap ≥ 8h starts a new thread).

**Properties:**
- `contact_id` — FK → Contact
- `started_at` / `ended_at` — timestamps (min/max of member
  messages)
- `message_count` — int
- `summary` — text, nullable (2–3 sentence LLM summary; cached,
  regenerated on demand or on thread change)
- `summary_generated_at` — timestamp, nullable

**Notes:**
- Threads are recomputed when new messages arrive that fall
  within the 8-hour window of an existing thread's last message.

---

## Email

One Gmail message tied to a contact.

**Properties:**
- `contact_id` — FK → Contact, nullable
- `thread_id` — FK → EmailThread
- `external_id` — string (Gmail message ID)
- `direction` — `inbound` / `outbound`
- `sent_at` — timestamp
- `subject` — string
- `body` — text
- `from_email` / `to_emails` / `cc_emails` — strings/arrays

---

## EmailThread

Native Gmail thread grouping.

**Properties:**
- `contact_id` — FK → Contact
- `external_thread_id` — string (Gmail thread ID)
- `started_at` / `ended_at` — timestamps
- `message_count` — int
- `summary` — text, nullable (2–3 sentence LLM summary)
- `summary_generated_at` — timestamp, nullable

---

## CallLog

One call record from the Mac agent.

**Properties:**
- `contact_id` — FK → Contact, nullable
- `external_id` — string
- `direction` — enum: `inbound` / `outbound` / `missed`
- `started_at` — timestamp
- `duration_seconds` — int

**Notes:** v1 has no recording/transcript. Post-v1 adds a
`CallRecording` entity linked here.

---

## CalendarEvent

One Google Calendar event involving the contact. Read-only
integration; narrow scope: title, time, attendees.

**Properties:**
- `contact_id` — FK → Contact
- `external_id` — string (Google Calendar event ID)
- `title` — string
- `starts_at` / `ends_at` — timestamps
- `attendees` — string[] (emails)
- `self_attended` — bool

**Notes:** An event with multiple matched contacts produces one
CalendarEvent row per linked contact (or a single event with a
join table — implementation detail; model as many-to-many if the
same event regularly involves many contacts).

---

## RelationshipSummary

Cached LLM-generated descriptive paragraph for a contact. Plain-
English only — no metrics.

**Properties:**
- `contact_id` — FK → Contact
- `body` — text
- `model` — string (LLM/version used)
- `inputs_hash` — string (hash of history considered — used to
  detect staleness)
- `generated_at` — timestamp

**Notes:** Latest row wins. Older rows kept for audit/debug.

---

## Score

A typed per-contact metric. v1 has one type: `freshness`. Modeled
generically so v2 can add more without schema changes.

**Properties:**
- `contact_id` — FK → Contact
- `kind` — enum: `freshness` (v1); extensible in v2
- `value` — int (0–100 for freshness)
- `label` — enum: `fresh` / `warm` / `fading` / `cold` / `dormant`
  (for freshness; other kinds may define their own label set)
- `computed_at` — timestamp
- `inputs_summary` — JSON, optional (what drove the number, for
  debugging)

**Notes:**
- One "current" row per (contact, kind) — enforced by a unique
  index on (contact_id, kind) on the current table, with
  historical rows in a separate ScoreHistory table, *or* a
  `is_current` boolean. Phase 4 picks the implementation.

---

## ScoreHistory

Append-only log of prior Score computations (same columns as
Score). Enables trend charts in v2.

---

## WeeklyPlan

The committed outreach plan for a given ISO week.

**Properties:**
- `user_id` — FK → User
- `iso_year` — int
- `iso_week` — int
- `committed_at` — timestamp
- `archived_at` — timestamp, nullable (set on week rollover)
- Unique on (user_id, iso_year, iso_week)

---

## WeeklyPlanItem

A contact in a WeeklyPlan.

**Properties:**
- `plan_id` — FK → WeeklyPlan
- `contact_id` — FK → Contact
- `status` — enum: `not_yet_reached` / `reached` / `connected`
- `reached_at` — timestamp, nullable
- `connected_at` — timestamp, nullable
- `source` — enum: `suggestions_flow` / `add_to_this_week` (from
  contact page) — useful for retrospective analysis

---

## CadenceRules

Per-user configuration for `/suggestions`. One row per user.

**Properties:**
- `user_id` — FK → User, unique
- `target_per_week` — int
- `personal_pct` — int (0–100; business_pct implied)
- `min_days_since_last_contact` — int

---

## TagCadenceRule

Tag-based cadence rule row (e.g. "at least 2 `byu-volleyball`
per month").

**Properties:**
- `user_id` — FK → User
- `tag_id` — FK → Tag
- `target_count` — int
- `window` — enum: `week` / `month` / `quarter`

---

## SuggestionState

Per-contact suggestion metadata that isn't an enum on Contact —
tracks when the contact was last offered, "not this week"
dismissals with timestamps, etc.

**Properties:**
- `contact_id` — FK → Contact, unique
- `last_suggested_at` — timestamp, nullable
- `last_dismissed_at` — timestamp, nullable
- `dismiss_count` — int (soft signal for ranking)

**Notes:** The permanent "Never" state lives on
`Contact.suggestion_status`, not here.

---

## Relationships summary

- **User** → has many Source, CadenceRules (one), TagCadenceRule,
  Contact, Tag, WeeklyPlan.
- **Source** → has one OAuthToken OR AgentToken; has many
  ImportRun, RawContact.
- **RawContact** → belongs to one Source; belongs (after merge)
  to one Contact.
- **Contact** → has many RawContact, Tag (via ContactTag),
  FollowUp, Note, Message, MessageThread, Email, EmailThread,
  CallLog, CalendarEvent, RelationshipSummary, Score, ScoreHistory,
  WeeklyPlanItem. Has one SuggestionState.
- **MessageThread** → has many Message.
- **EmailThread** → has many Email.
- **WeeklyPlan** → has many WeeklyPlanItem; WeeklyPlanItem →
  belongs to one Contact.
- **MergeCandidate** → references 2+ RawContact; resolves into a
  Contact.

---

## Notes on persistence

- **Database:** Postgres (Vercel Postgres or Supabase — decided
  in Phase 4 per BRIEF's open question).
- **Soft deletes:** applied to user-editable entities with
  history: Contact, Note, FollowUp, Tag. Raw ingested entities
  (Message, Email, CallLog, CalendarEvent, RawContact,
  MessageThread, EmailThread) are hard-deletable / rebuildable.
- **Encryption at rest:** OAuth access/refresh tokens and agent
  tokens must be encrypted at the column level. Message/email
  bodies: v1 stores plaintext in Postgres (single-tenant, Robb's
  own infra); revisit column-level encryption if the product
  moves toward multi-tenant.
- **Audit trail:** v1 does not maintain an explicit audit log
  beyond the history-tables already modeled (ScoreHistory,
  ImportRun, etc.). Post-v1 consideration.
- **Timezones:** all timestamps stored as UTC; ISO week math uses
  `User.timezone`.
