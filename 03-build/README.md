# Build

Phase 4 populates this folder with the actual Next.js + Tailwind project.

Until Phase 4 is approved (Gate 4), this folder is empty.

## Why the code lives here

Keeping code under `03-build/` cleanly separates working code from planning
artifacts. It also means the whole project-starter/ folder can be copied
anywhere without entangling the spec docs with build output.

When Phase 4 begins, Superpowers' `writing-plans` skill will produce
ROADMAP.md at the project root, then `using-git-worktrees` and
`subagent-driven-development` will take over. Code gets written into this
folder.

## Default structure (will be created by Phase 4)

```
03-build/
├── app/                  (Next.js App Router)
├── components/
├── lib/
├── public/
├── styles/
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── README.md
```
