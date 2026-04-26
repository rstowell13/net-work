# HOW TO USE THIS KIT

> Read this once. Then you can mostly ignore it — the kit runs itself from
> here on out, with Claude guiding you through every step.

---

## Part 1 — First-time setup (do once, ever)

### 1.1 — Install the skills and plugin

Open Claude Code (inside Claude Desktop) and run, one at a time:

**Install Superpowers:**
```
/plugin marketplace add obra/superpowers-marketplace
/plugin install superpowers@superpowers-marketplace
```
Then quit and restart Claude Desktop. On restart, Superpowers is active.
You'll know because Claude will behave differently from the first message
of any new session — it'll ask questions before coding.

**Install Impeccable:**
```
npx skills add pbakaus/impeccable
```
Or follow the instructions at `impeccable.style`.

**Install Taste Skill:**
```
npx skills add Leonxlnx/taste-skill
```

If any of those commands don't work, paste the error into Claude Code and
ask it to fix. These tools evolve; install commands occasionally change.

### 1.2 — Set up your global CLAUDE.md

This is the file that applies to *every* project, not just one. You set it
up once, it persists forever.

On a Mac:
1. Open **Finder**.
2. Press **Cmd + Shift + G** (Go to folder).
3. Type `~/.claude` and press Enter. If the folder doesn't exist, create it.
4. Inside, create a file called `CLAUDE.md`.
5. Copy the contents of **`GLOBAL_CLAUDE.md`** from this kit into that file.

From this point forward, every Claude Code session — on any project —
starts with your profile, default stack, and skill list already loaded.

### 1.3 — Set up GitHub and Vercel

See `DEPLOYMENT.md`. You only have to do this one time.

### 1.4 — Put the starter kit somewhere easy to find

Move the entire `project-starter/` folder somewhere you'll remember.
Good options:
- `~/Documents/project-starter/` (home folder)
- `~/Desktop/project-starter/` (desktop)

This is the **master template**. You never edit this folder. You copy
from it.

---

## Part 2 — Starting a new project

Every time you start a new project, these are the exact steps. No variations.

### 2.1 — Copy the kit

1. Open the master `project-starter/` folder.
2. Select the whole folder, copy it (Cmd+C).
3. Paste it wherever you want your new project to live. Good default:
   `~/Projects/`.
4. Rename the pasted copy to your project name. Lowercase, hyphens not
   spaces. Examples:
   - `cap13-investor-site`
   - `cap13-crm`
   - `via-limon-deal-memo`

### 2.2 — Paste your transcript

1. Open the new project folder.
2. Open `00-discovery/transcript.md` in any text editor (TextEdit works fine,
   Claude Code also works).
3. Delete the placeholder text.
4. Paste your raw transcript, voice memo transcription, or initial idea dump.
5. Save.

**Don't edit the transcript to sound polished.** Raw is better. The worse
it reads, the more useful it is for follow-up questions.

### 2.3 — Open the folder in Claude Code

1. Open **Claude Desktop**.
2. Open **Claude Code** within Claude Desktop.
3. Open your new project folder in it.

### 2.4 — Kick off the workflow

Type this exact message, literally:

> Follow WORKFLOW.md, starting from Phase 1.

That's it. Claude reads WORKFLOW.md and CLAUDE.md automatically, reads the
transcript, and begins the brainstorming conversation.

### 2.5 — Respond to Claude's questions

Claude will walk you through each phase. Your job during this phase is to
**answer questions and approve gates**. Specifically:

- **Answer questions honestly, including "I don't know."** Claude handles
  "I don't know" well — it'll propose options or defer the decision.
- **Approve explicitly.** When Claude asks "ready to move on?" say
  "approved" or "move on." Don't say "sounds good" — it's ambiguous.
- **Push back if something feels off.** If Claude writes a BRIEF.md section
  that doesn't match what you meant, say so. The draft is a starting
  point, not a ruling.

### 2.6 — The four gates

The workflow has four gates. You'll hit each in order. Claude will stop
at each and wait for approval. Your job at each gate:

- **Gate 1 (end of Phase 1):** Read `BRIEF.md` top to bottom. Does it
  capture the vision? Can someone who wasn't there understand what we're
  building? If yes, approve. If not, tell Claude what to fix.

- **Gate 2 (end of Phase 2):** Read the four spec files in `01-spec/`.
  Can you answer "what does this page do?" for every page in SITEMAP.md?
  If yes, approve. If not, iterate.

- **Gate 3 (end of Phase 3):** Open the three brand options and pick one.
  Then, for each key page, open the three HTML mockups in a browser and
  pick one. This is the only phase where you do real picking — the rest
  is mostly reading and approving.

- **Gate 4 (start of Phase 4):** Read `ROADMAP.md`. It's the plan for
  building. Does the sequence make sense? Is milestone 1 actually an
  end-to-end slice? If yes, approve. Coding begins only after approval.

### 2.7 — Build and deploy

After Gate 4, Claude writes code. You review, approve, Claude pushes to
GitHub, Vercel deploys, you see it live.

When you hit your first deploy, follow `DEPLOYMENT.md` step by step.
Claude will walk you through it too.

---

## Part 3 — Working within a project over time

Projects aren't done in one sitting. When you come back the next day:

1. Open Claude Code on the project folder.
2. Say: **"Where are we in the workflow? What's next?"**
3. Claude reads `ROADMAP.md` (and the other artifacts) and tells you.
4. Keep going.

This is why the artifacts matter. They're the memory. Claude forgets the
conversation; the files don't.

---

## Part 4 — What you actually do vs. what Claude does

### You do:
- Copy the starter folder.
- Paste the transcript.
- Type "Follow WORKFLOW.md, starting from Phase 1."
- Answer questions.
- Read and approve artifacts at gates.
- Pick your preferred brand and mockups at Gate 3.
- Review code before deployment.

### Claude does:
- Reads the transcript.
- Drafts BRIEF.md and asks you about gaps.
- Produces the four spec files one at a time.
- Generates three brand options and three mockups per key page.
- Writes the ROADMAP.
- Writes the actual code, with TDD, reviews, and verification (via
  Superpowers).
- Pushes to GitHub and triggers deployment.

### You do NOT:
- Edit the master starter folder (copy it instead).
- Run terminal commands beyond what this guide shows (Claude does the rest).
- Write code (Claude does it in Phase 4).
- Remember which skill to invoke when (WORKFLOW.md tells Claude).
- Deploy manually (Vercel does it automatically after the first setup).

---

## Part 5 — When things go wrong

### "Claude started coding before Phase 4"
Stop it immediately. Say: "Stop. We're not past Gate 4 yet. Re-read
WORKFLOW.md and go back to where we should be."

### "Claude skipped the design phase"
Say: "Stop. WORKFLOW.md Phase 3 requires three brand options and three
mockups per key page. Go back and do Phase 3 properly."

### "The brand options all look similar"
Say: "These three directions aren't meaningfully different. Per
`02-design/brand-options/README.md`, each should be something that could
be someone's favorite. Regenerate with more contrast."

### "Claude seems to have forgotten the project"
Say: "Read CLAUDE.md, WORKFLOW.md, and ROADMAP.md. Tell me where we are."
This re-grounds it in the artifacts.

### "Something in the plan contradicts the spec"
Stop coding, update the spec (Phase 2 files) or the design (Phase 3),
re-approve the change, update ROADMAP.md, then resume. The artifacts are
the source of truth; code follows artifacts, not the other way around.

---

## Part 6 — Your first project should be small

Don't start with the Cap13 CRM. Start with something low-stakes. A single
marketing landing page for one Cap13 deal is a good first project — one
page, no auth, no database, no business logic. You'll learn the kit's
rhythm without the stakes of something production-critical.

Second project can be a bigger marketing site. Third can be the CRM or
an internal tool. By the fourth, the workflow will feel automatic and
you can start thinking about productizing.

---

## That's it

Three things to remember:

1. **Copy the kit, paste the transcript, type the magic sentence.**
2. **Read artifacts at gates. Approve explicitly.**
3. **Files are the memory. Trust the process.**
