# BRIEF

> First draft based on `transcript.md`. Sections refined one at a time
> with Robb before Gate 1.

## Vision

I want a personal CRM for the people I actually care about — friends,
family, people I've lost touch with, people I want back in my life.
It's a personal tool first; it handles business and hybrid
relationships too, but the soul of it is "don't let the people who
matter drift away."

It pulls everyone I already know out of the places they're scattered —
LinkedIn, my phone contacts, call logs, email, iMessage — and helps me
triage them one person at a time (keep in touch, or don't) at a pace
that makes getting through hundreds of contacts feel fast, not tedious.

From there it becomes an ongoing nudge engine: a few times a week it
tells me who I haven't talked to in a while and surfaces everything it
already knows about our relationship — our last messages, our call
history, what I said I'd follow up on, notes I've left myself — so I
can reach out with real context instead of a cold "hey." Over time,
richer conversation-capture features (call recording and transcription
in the Granola style) come in — but that's later; v1 is about triage,
nudges, and making the history I already have legible.

The goal is to turn "staying in touch" from something I feel guilty
about into something that just happens.

## Problem

I've always been bad at staying in touch, and I'm at a point where I can
feel it catching up with me — friends I haven't talked to in years,
people I genuinely care about drifting out of my life by default rather
than by choice. The mechanics are obvious once you look at them: my
contacts are scattered across LinkedIn, my phone, call logs, and email,
and none of those systems know which relationships actually matter.
Nothing tells me "you haven't talked to this person in 14 months and
last time you said you wanted to reconnect." Conversations vanish the
moment they end — no record of what we discussed, what I said I'd follow
up on, or what was going on in their life. So the only relationships I
maintain are the ones that happen to stay on top of my inbox, and
everyone else slowly slips away. This also has a real cost on the work
side — Cap13 runs on relationships, and a network you let decay is a
network that stops generating deal flow, introductions, and trust — but
the deeper problem, the one that actually drove this, is personal.

## Target users

**Primary and only v1 user: me (Robb).** A partner at a private family
investment firm with a large, mixed personal/professional network —
friends, family, former colleagues, investors, founders, service
providers. High social capital, no system for maintaining it. Non-
technical, iOS + Mac, heavy LinkedIn + Gmail + iPhone user. The product
is designed around my actual contact sources, my actual devices, and my
actual workflow.

**Design posture: n=1 with good hygiene.** Every feature is built for me
first — no speculative features for hypothetical other users, no extra
UI flexibility I don't need. But the foundations don't hard-code me
personally: no baked-in email addresses, hardcoded account IDs, or
single-user assumptions in the data model, auth, or integrations. If the
product turns out to be worth productizing later, the path from "Robb's
app" to "multi-tenant SaaS" is a real project but not a rewrite.

**Hypothetical future users (not designed for in v1):** other
relationship-driven operators — investors, founders, salespeople, BD
people, consultants — who live in LinkedIn + phone + email and feel
their network slipping. Useful for framing, not for scoping.

## Success criteria

**Build-level (v1 is "done" when):**
- I can onboard my full contact graph (LinkedIn + phone + email + call
  logs) in a single sitting.
- After triage, I have a clean "keep in touch" list, with each contact
  categorized as personal / business / both.
- The app surfaces 2–5 people per week to reach out to, each with a
  short recap drawn from our actual history together — last
  conversation, open follow-ups, notes — that I can use as real
  context in a message.
- Past iMessage conversations and call-log history are attached to the
  right contact and visible when I'm deciding who to reach out to or
  prepping what to say.

**Outcome-level (at the 3-month mark, all three must be true for full
success; any one alone is a partial success):**
- **Habit.** I use it at least weekly — open it, triage the suggestions,
  reach out to at least a couple of people.
- **Reconnection.** I've had real conversations (calls, meals,
  substantive messages) with 10+ people I'd otherwise have let slip,
  *because* the app prompted me.
- **Reflex.** When I think about a person, I open this app first —
  before LinkedIn, before my contacts app. It's where my relationship
  memory lives.

## Key constraints

- **Platform: web app for v1**, with a small local Mac-side agent as a
  companion. No iOS app in v1. No in-app call recording in v1.
- **Single-operator build.** Robb is non-technical. The system is built
  by Claude + Robb, deployed on Vercel, using the default stack (Next.js
  App Router + Tailwind + TypeScript + Postgres on Vercel Postgres or
  Supabase).
- **Mac-side agent is a hard requirement for v1.** A small local script
  (runs nightly on Robb's Mac) reads iMessage history from the local
  Messages database (`~/Library/Messages/chat.db`) and call logs from
  the local Call History database (via macOS Continuity — needs
  verification during Phase 2), normalizes the data, and pushes it to
  the web app's database over an authenticated API. Without this, the
  product is not useful to Robb. Scope, reliability, and auth for this
  agent need to be treated as first-class during planning.
- **Contact / signal sources in v1:**
  - Apple Contacts — via the Mac-side agent (most of Robb's
    contacts live here).
  - Google Contacts — OAuth sync.
  - Gmail — OAuth, for message history + metadata.
  - Google Calendar — OAuth, **read-only**, narrow scope:
    event title, attendees, date/time. Events involving a
    contact appear in that contact's Diary. No invite sending,
    no complex calendar UI.
  - LinkedIn — manual CSV export (no official API); revisit
    scraping / extension later.
  - iMessage + call logs — via the Mac-side agent.
- **Explicit v1 exclusions** (moved to Non-goals section too): in-app
  call recording/transcription, iOS/Android apps, cellular call
  recording, auto-sent outbound messages.
- **Privacy is existential.** This holds private message content and
  call metadata on real people. Single-tenant deployment, Robb's own
  infrastructure, never shared, never used for training, never
  analytics'd. Auth on the ingestion API must be solid — the Mac agent
  pushes real message content over the wire.
- **Hard deadline: v1 completed in 1 week.** This is aggressive and
  shapes every scope decision from here forward. If a Phase 2 or
  Phase 3 choice would push v1 past the week, it must either be cut
  or simplified. "v1" means: contact ingest from all sources listed
  above, triage flow, categorization, weekly outreach nudges,
  per-contact history view.

## Inspirations and references

- **Tinder** — the *spirit* of swipe-to-triage: one person at a time,
  binary decision, minimal friction, momentum over deliberation.
  Literal swiping is an iOS pattern; since v1 is web-only, the UX
  borrows the feel (one card on screen, keep/skip, fast cadence) but
  uses keyboard shortcuts *and* click buttons instead of touch
  gestures. Triage also supports a **bulk-list mode** — a scrollable
  list of contacts with checkboxes, for when Robb wants to scan many
  at once rather than go one-by-one. Both modes write to the same
  keep/skip state.
- **Granola** — call recording and transcription that quietly captures
  conversations and extracts structured takeaways. **Not in v1** (call
  recording is deferred), but kept as the reference for how that
  feature should feel when we build it.
- **Existing personal CRMs** (Clay, Dex, Monica, UpHabit) — aware of
  but not used. Listed as category reference points; no specific
  features borrowed yet.

## Non-goals

**Scope exclusions (v1):**
- **Not a sales CRM.** No pipeline stages, deal tracking, or team
  collaboration. This is one person's relationship graph.
- **Not a replacement for LinkedIn, email, or phone.** It reads from
  them and augments them; it does not host messaging itself.
- **Not a group/shared tool.** Single user. No sharing contacts, no
  team features.
- **Not an auto-send assistant.** The app never sends messages on
  Robb's behalf. All outbound communication happens in the user's own
  apps (Messages, Gmail, etc.).
- **Not a public product.** Built for Robb first. Productizing is a
  later decision.

**Explicitly deferred from v1 (revisit later):**
- **No iOS/Android app.** Web + Mac agent only.
- **No in-app call recording or transcription.** Granola-style feature
  deferred.
- **No cellular call access.** Call *logs* come via the Mac agent;
  live calls are not touched.
- **No LinkedIn scraping or extension.** CSV import only.
- **No AI-drafted message suggestions.** v1 surfaces the person and
  context; Robb writes the opener.
- **No cadence-from-calendar logic.** v1 uses Google Calendar
  read-only as a Diary input (events involving a contact show up
  in their history). It does NOT read free/busy to pace nudges
  or suggest outreach timing based on open slots — that's
  post-v1.

**Permanently out of scope (not just deferred):**
- **No social media aggregation.** The app does not pull activity from
  LinkedIn, Facebook, Instagram, or X. Technically impractical and not
  worth the integration cost. "What's going on with them" context in
  the app comes from conversation history (iMessage, Gmail, call
  logs) and from notes Robb writes — not from scraping social feeds.

## Open questions

Flagged for Phase 2, not blocking Gate 1.

- **Mac agent — call log access.** Confirm during Phase 2 that macOS
  Continuity actually syncs iPhone call history to the Mac in a
  readable location. If not, call logs may slip from v1 to
  post-v1.
- **Mac agent — install and auth.** How does the agent get installed
  and authenticated for a non-technical user? LaunchAgent + a
  long-lived API token dropped into a config file? Something
  friendlier?
- **Relationship intelligence in triage.** How much does the app
  *infer* up front vs. just show the contact and let Robb decide?
  Candidate signals: message frequency, recency, whether the contact
  is in phone + email + LinkedIn (strong signal) vs. only one
  (weak). Design in Phase 2.
- **Weekly cadence logic.** How does the app pick who to surface each
  week? Simple recency? Weighted by category (personal vs. business)?
  User-tunable? Design in Phase 2.
- **Contact deduplication/merging.** Same person often appears in
  phone, email, and LinkedIn with slight name/email variations.
  Merge strategy needs design in Phase 2.
- **Hosting specifics.** Vercel + Postgres is the default, but
  "private data, single-tenant, defensible" may push toward Supabase
  (own project) or self-hosted Postgres. Decide before Phase 4.
