# Project Starter Kit

A reusable template for running any new project through a structured workflow:
**Discovery → Product Definition → Design → Build**.

## Start here

**Read `HOW_TO_USE.md`.** It's the explicit step-by-step for first-time
setup and for starting every new project.

Everything else in this folder is either a template Claude fills in, or a
reference document Claude reads.

## What this kit assumes

You have installed in Claude Code:
- **Superpowers** plugin (`obra/superpowers`)
- **Impeccable** skill (`pbakaus/impeccable`)
- **Taste Skill** (`Leonxlnx/taste-skill`)

You have also placed `GLOBAL_CLAUDE.md` at `~/.claude/CLAUDE.md` on your
machine. `HOW_TO_USE.md` walks you through all of this.

## What lives where

```
project-root/
├── HOW_TO_USE.md          ← read this first, every time
├── README.md              ← this file
├── GLOBAL_CLAUDE.md       ← template for ~/.claude/CLAUDE.md (one-time setup)
├── CLAUDE.md              ← per-project context, filled during Phase 1
├── WORKFLOW.md            ← the four-phase pipeline Claude follows
├── ROADMAP.md             ← master progress tracker, populated in Phase 4
├── DEPLOYMENT.md          ← how to deploy (read once)
│
├── 00-discovery/
│   ├── transcript.md         ← paste your raw transcript here
│   └── BRIEF.md              ← produced in Phase 1
│
├── 01-spec/                  ← produced in Phase 2
│   ├── SITEMAP.md
│   ├── USER_FLOWS.md
│   ├── FEATURE_SPEC.md
│   └── DATA_MODEL.md
│
├── 02-design/                ← produced in Phase 3
│   ├── brand-options/        (three directions; deleted after choice)
│   ├── DESIGN_SYSTEM.md      (the chosen brand, locked)
│   └── mockups/              (three HTML mockups per key page)
│
└── 03-build/                 ← populated in Phase 4
    └── [actual Next.js code]
```

## The golden rule

**The files are the memory.** Anything that needs to persist across Claude
Code sessions lives in a file, not in chat. Every phase produces durable
artifacts the next phase reads. If you're re-explaining the project,
something should have been written down.

## Four gates

At the end of each phase there's a gate — a decision point where you
review and approve. See `WORKFLOW.md` for details.

- **Gate 1:** BRIEF.md is complete and accurate.
- **Gate 2:** Four spec files tell a complete story.
- **Gate 3:** Every key page has a chosen mockup.
- **Gate 4:** ROADMAP.md is approved before any code is written.
