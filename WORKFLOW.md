# WORKFLOW

> This is the master pipeline Claude follows for any project using this starter kit.
> When I say "Follow WORKFLOW.md, starting from Phase X," read this file and execute that phase.

---

## Conflict resolution with Superpowers

This WORKFLOW.md and the Superpowers plugin sometimes address similar
territory. The rules:

1. **Superpowers wins on engineering topics** (task decomposition,
   planning, TDD, code review, git worktrees, debugging, build execution).
2. **WORKFLOW.md wins on product and design topics** (brief intake,
   sitemap, user flows, feature spec, data model, brand, mockups).
3. **If Superpowers wants to save artifacts at `docs/superpowers/...`
   paths, override those to this kit's paths instead** (`00-discovery/`,
   `01-spec/`, `ROADMAP.md`).
4. **Genuine contradictions → stop and ask Robb.**

The rules also live in `~/.claude/CLAUDE.md`. This is reinforcement.

## Architecture

Four phases, each with an input, an output (artifact files), and a gate.
**Do not proceed past a gate without explicit approval.**

```
Phase 1: Discovery     → BRIEF.md                              → Gate 1
Phase 2: Product Def.  → SITEMAP / FLOWS / FEATURES / DATA     → Gate 2
Phase 3: Design        → DESIGN_SYSTEM.md + mockups            → Gate 3
Phase 4: Build         → ROADMAP.md + working code             → Gate 4
```

Superpowers owns Phases 1, 2, and 4.
Impeccable + Taste own Phase 3.
This file orchestrates the handoffs.

---

## Phase 1 — Discovery

**Input:** Raw transcript in `00-discovery/transcript.md`, plus optional
inspirations/references in `00-discovery/inspirations/`.

**Goal:** Produce a complete `00-discovery/BRIEF.md`.

### Steps

1. **Read the transcript fully** before asking anything. Quote specific lines
   in your questions so I know you actually read it.

2. **Produce a first-draft BRIEF.md** with the following sections:
   - **Vision** — one paragraph, the elevator pitch in my own voice.
   - **Problem** — what's broken today that this fixes.
   - **Target users** — who uses this, with enough specificity that a stranger
     could recognize one.
   - **Success criteria** — how we'll know this worked.
   - **Key constraints** — budget, timeline, integrations, must-haves.
   - **Inspirations / references** — products, sites, or ideas I mentioned.
   - **Non-goals** — what this is explicitly NOT. This section is critical.
     Pull these from the transcript, and propose additional ones.

3. **Invoke Superpowers' `brainstorming` skill** to refine section by section.
   For each section:
   - Show me what you drafted.
   - Ask project-specific follow-up questions where the transcript was silent
     or ambiguous. Quote the relevant line. Do not ask generic PM questions.
   - Update the section based on my answers.
   - Move to the next section when I approve.

4. **Final self-review.** Once all sections are drafted, re-read BRIEF.md and
   flag: contradictions, placeholders, scope creep, anything a stranger
   couldn't follow.

### Gate 1

I read BRIEF.md end-to-end and confirm it captures the vision. If I say
"approved" or "move on," proceed to Phase 2. Otherwise, iterate.

---

## Phase 2 — Product Definition

**Input:** `00-discovery/BRIEF.md`.

**Goal:** Produce four artifacts in `01-spec/` that together define what
we're building.

### Artifacts, in order

Produce these **sequentially**, approving each before starting the next.
Do not produce all four at once.

1. **SITEMAP.md** — every page/screen the product has, with a one-sentence
   purpose. Group by section (public / authenticated / admin / etc.).
   Include "empty state" and "error state" as pages where they meaningfully
   differ from the populated version.

2. **USER_FLOWS.md** — the critical paths through the product. Each flow
   names every page touched. At minimum: new-user onboarding flow, primary
   task flow, settings/account flow. If a flow requires a page that's not
   in SITEMAP.md, update SITEMAP.md first.

3. **FEATURE_SPEC.md** — for every page in SITEMAP.md, what functionality
   lives there. Not wireframes. Capabilities. "Dashboard: shows list of X,
   filterable by Y, sortable by Z, quick-action buttons for A and B, empty
   state shows tutorial CTA."

4. **DATA_MODEL.md** — entities, their properties, their relationships.
   Even simple apps need this. Use plain English with structure; don't write
   SQL yet. Example: "User has many Projects. Project has title, status
   (draft/active/archived), owner (User), created_at, updated_at."

### How to work through this phase

Use Superpowers' `brainstorming` skill for the interactive Q&A pattern, but
**explicitly request separate files, not a single design doc**. The
brainstorming skill's section-by-section validation is the right pattern;
just direct it to produce four distinct artifacts.

### Gate 2

All four files exist and tell a coherent story. I should be able to answer
"what does this page do and what data does it touch?" for any page in
SITEMAP.md. If I can't, we're not ready for Phase 3.

---

## Phase 3 — Design

**Input:** All artifacts from Phases 1 and 2.

**Goal:** Produce a locked `DESIGN_SYSTEM.md` and chosen mockups for the
key pages.

### Important: step outside Superpowers for this phase

Superpowers has no aesthetic sensibility. Invoke **Impeccable** and **Taste
Skill** explicitly during Phase 3. Tell me which one you're using at each step
so I know what's happening.

### Step 3.1 — Three brand directions

Invoke Impeccable. Produce three brand guideline documents in
`02-design/brand-options/`:

- `brand-01-[name].md`
- `brand-02-[name].md`
- `brand-03-[name].md`

Each contains, using Impeccable's vocabulary:
- Personality / vibe (one paragraph, evocative but concrete)
- Color palette (OKLCH-based, 6-8 colors with roles and hex fallbacks)
- Typography pairing (heading + body + any accent; real fonts with rationale)
- Motion character (timing, easing, intensity dial)
- 3-5 visual principles that distinguish this direction

The three options should be **meaningfully different directions**, not
cosmetic variants. Describe the personality contrast in one line at the top
of each file.

### Step 3.2 — I pick one

I read all three, pick one. On approval:
- Delete the other two files.
- Rename the chosen one to `02-design/DESIGN_SYSTEM.md`.
- This file is now locked. Any future design change edits this file
  intentionally, with me, and cascades to mockups.

### Step 3.3 — Identify key pages

Not every page needs three mockups. Look at SITEMAP.md and identify the
**pages that carry the product's feel** — typically:
- Marketing: home, pricing, one product/feature page.
- Internal tool / dashboard: the main dashboard, one CRUD detail view.
- Product: signup/onboarding, main "doing the work" page.

Secondary pages (settings, account, legal, error pages) will follow the
pattern of the key pages. Flag these with "follows pattern from [page]" in
SITEMAP.md.

### Step 3.4 — Three mockups per key page

For each key page, produce three single-file HTML mockups in
`02-design/mockups/[page-name]/`:

- `option-a.html`
- `option-b.html`
- `option-c.html`

Use **Taste Skill's 3-dial system** to differentiate:
- Option A: lower variance, conservative composition.
- Option B: the "default" — Taste's recommended baseline.
- Option C: higher variance, more expressive composition.

All three must honor `DESIGN_SYSTEM.md`. They differ in **layout and
composition**, not in brand. Each file should have an HTML comment at the
top describing its intent in one sentence.

Make them real enough to open in a browser and judge. Stub content is fine
as long as it's plausible; don't use lorem ipsum.

### Step 3.5 — I pick one per page

For each key page, I pick one. On approval:
- Rename chosen file to `chosen.html` in that page's folder.
- Other options can stay (sometimes useful as reference) or be deleted.

### Gate 3

Every key page has a `chosen.html`. Every secondary page has a "follows
pattern from X" note in SITEMAP.md. DESIGN_SYSTEM.md is locked.

---

## Phase 4 — Build

**Input:** Everything from Phases 1-3.

**Goal:** Working, deployed code.

### Hand off to Superpowers

This is Superpowers' home turf. Specifically:

1. **Invoke `writing-plans`.** Feed it BRIEF.md, the four spec files, and
   DESIGN_SYSTEM.md + chosen mockups. Produce `ROADMAP.md` at the project
   root with milestones and bite-sized tasks (2-5 min each, exact file
   paths, verification steps).

2. **First milestone is always "scaffolding + one end-to-end slice."**
   Don't build breadth before depth. Get one flow working end-to-end before
   adding more.

3. **Invoke `using-git-worktrees`** to work on an isolated branch.

4. **Invoke `subagent-driven-development` or `executing-plans`.** Execute
   tasks with two-stage review (spec compliance, then code quality).

5. **At every milestone boundary**, run Impeccable's `/audit` and `/polish`
   commands. Design quality is not a phase-3-only concern; it needs
   reinforcement.

6. **Invoke `finishing-a-development-branch`** at the end of each milestone
   to merge cleanly.

### Gate 4

Before any code is written, I read ROADMAP.md and approve. Code begins only
after approval.

### Deployment

When the first meaningful milestone is done, walk me through deploying to
Vercel step by step. I have never deployed anything. Assume zero prior
knowledge. Do the technical parts yourself where possible.

---

## When things go sideways

If the build surfaces something that contradicts the spec:
1. **Stop coding.**
2. Go back and update the spec file (Phase 2) or the design (Phase 3).
3. Re-approve the change with me.
4. Update ROADMAP.md.
5. Resume coding.

The artifacts stay the source of truth. Code follows artifacts, not the
other way around.

---

## Running this from a transcript

When I paste a long transcript into `00-discovery/transcript.md` and say
"follow WORKFLOW.md from Phase 1," you should:

1. Read the transcript fully.
2. Acknowledge what you understood in 3-5 bullets.
3. Begin Phase 1, Step 1.

Do not ask for permission to start. The instruction to follow WORKFLOW.md
is the permission.
