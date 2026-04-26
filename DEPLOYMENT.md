# DEPLOYMENT GUIDE

> Written for someone who has never deployed a web application before.
> Assumes zero prior knowledge. No shame in reading every line.

## What "deploying" actually means

"Deploying" is the act of taking the code that runs on your laptop and
putting it on a computer on the internet so other people can visit it by
typing a URL into a browser.

For everything we'll build using this starter kit, deployment is
approximately as simple as modern software gets. You are not going to
SSH into a server, configure Nginx, or run anything in a terminal more
complex than `git push`. Claude handles the technical parts. You handle
the clicking.

---

## The mental model

Three pieces are involved:

1. **Your laptop** — where you write code (with Claude's help).
2. **GitHub** — a website that stores your code in the cloud, so it isn't
   stuck on your laptop.
3. **Vercel** — a company that reads code from GitHub and turns it into a
   live website on the internet.

The flow is:

```
laptop  →  git push  →  GitHub  →  Vercel  →  live site
```

Every time you push code to GitHub, Vercel automatically rebuilds and
re-deploys your site. There is no "deploy button" to press after the
first setup. It just happens.

---

## One-time setup (do this once, ever)

You only do this the first time you use Vercel. After that, every new
project is 2 clicks.

### Step 1 — GitHub account

If you don't have one:
1. Go to **github.com**.
2. Click **Sign up**.
3. Use your primary email. Pick any username (it can be seen publicly —
   `rstowell13` is fine).
4. Verify your email.

### Step 2 — Install Git and authenticate

Claude Code needs Git (a command-line tool) to push code to GitHub.

Ask Claude Code: _"Check if git is installed, and if not, install it and
authenticate me with GitHub."_ Claude will walk you through it. On a Mac
it's usually one command.

### Step 3 — Vercel account

1. Go to **vercel.com**.
2. Click **Sign up**.
3. Choose **Continue with GitHub**. This is the easy path — it links
   Vercel to your GitHub automatically.
4. Authorize Vercel to see your GitHub repositories.

You now have everything you need. The first-time setup is done forever.

---

## Deploying a new project (per-project)

For every new project built with this starter kit:

### Step 1 — Create a GitHub repository

When Phase 4 begins, ask Claude: _"Create a private GitHub repository for
this project and push the code to it."_

Claude runs the commands. You'll see a new repo appear at
`github.com/rstowell13/[project-name]`. **Private** is the right default —
no one can see it but you.

### Step 2 — Connect it to Vercel

1. Go to **vercel.com/dashboard**.
2. Click **Add New...** → **Project**.
3. Vercel shows a list of your GitHub repos. Find the new one. Click
   **Import**.
4. Vercel auto-detects that it's a Next.js project. Don't change any
   settings.
5. Click **Deploy**.

Wait about 60 seconds. Vercel builds and deploys. You get a URL that
looks like `project-name-abc123.vercel.app`. That's your live site.

### Step 3 — (Optional) Add a custom domain

For Cap13 marketing pages you'll eventually want `something.cap13.com` or
a real domain. When ready:

1. Buy a domain — **Namecheap** or **Cloudflare Registrar** are good
   options. ($10-15/year for most domains.)
2. In Vercel, go to your project → **Settings** → **Domains**.
3. Type the domain. Vercel tells you exactly what DNS records to add at
   your registrar.
4. Follow the instructions. It takes 5-60 minutes for DNS to propagate.
5. Done. Your site is live on the custom domain.

Claude can walk you through this step-by-step when the moment comes.

---

## What happens when you change something

After setup, the loop is:

1. You ask Claude to change something.
2. Claude edits the code in `03-build/`.
3. You approve.
4. Claude commits and pushes to GitHub.
5. Vercel automatically detects the push, rebuilds, and deploys.
6. Within about 60 seconds, your changes are live.

You will never again think about what "deployment" means after the first
project.

---

## What Vercel costs

Vercel's free tier is generous and covers everything Cap13 will need for
a long time:
- Hosting for static pages and small Next.js apps.
- Automatic HTTPS (secure https:// URLs) at no cost.
- Custom domains.
- Preview deployments (every pull request gets its own test URL).

You'll hit limits only if a product gets real traffic (thousands of
visits per day) or uses heavy server-side compute. When that happens,
the next tier is $20/month per team member. We're a long way from that.

---

## About your Apple Developer account

Your Apple Developer account ($99/year) is for **native iOS apps** —
apps that run on an iPhone through the App Store.

For everything in this starter kit, we build **web apps**. A web app
opened on an iPhone through Safari looks and feels identical to a native
app for most use cases, with none of the App Store overhead.

Keep the Apple account. If one of your products eventually needs to be a
real iOS app (push notifications, Apple Pay, home screen icon with full
native behavior), we'll use it then. For now, web is the right bet.

---

## Troubleshooting

If a deployment fails, Vercel shows an error log. Screenshot it, paste
it into Claude Code, and say _"the Vercel deploy failed, fix it."_ Claude
reads the log and fixes the code. Push again. It'll work.

If something works locally but breaks on Vercel, it's almost always one of
three things: environment variables missing, a dependency not listed in
`package.json`, or a case-sensitive filename issue (Macs are case-
insensitive, Vercel's Linux is not). Claude diagnoses these quickly.

---

## The one thing worth remembering

**Push to GitHub. Vercel deploys automatically.**

That's it. That's deployment.
