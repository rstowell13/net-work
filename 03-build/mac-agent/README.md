# net-work Mac agent

A small local Python agent that reads iMessage (`~/Library/Messages/chat.db`),
Apple Contacts, and Call History on the user's Mac and pushes them to the
net-work backend (`POST /api/ingest/{kind}`). It is the **sole** source of
iMessage / Contacts / Call-History data — the cloud cron only merges and relinks
data that this agent has already ingested.

It runs as a macOS **LaunchAgent** (`net.work.agent`): daily at 2:00 AM
(`StartCalendarInterval`) plus `RunAtLoad` to catch up on wake/login. The
watermark lives in `~/.net-work/agent/state.json`; logs in `agent.log` /
`agent.err`.

## Install

From the app's `/settings/sources` page (token + base URL are templated in):

```sh
curl -fsSL https://raw.githubusercontent.com/rstowell13/net-work/main/03-build/mac-agent/installer.sh | \
  NETWORK_AGENT_TOKEN=<token> NETWORK_API_BASE=<url> bash
```

After install, grant the **venv python** (`~/.net-work/agent/.venv/bin/python`)
Full Disk Access and Contacts access in System Settings → Privacy & Security, and
turn **off** iCloud "Optimize Mac Storage" so `chat.db` holds full history. The
installer prints these steps on completion.

Verify the **scheduled** path (never a direct `python -m agent` — that borrows
the calling shell's Full Disk Access and gives a false pass):

```sh
launchctl kickstart -k "gui/$(id -u)/net.work.agent"
grep -iE "authorization denied|OS_REASON_CODESIGNING" ~/.net-work/agent/agent.err   # expect none
cat ~/.net-work/agent/state.json                                                     # imessage_rowid advances
```

## Why the installer is shaped the way it is (two workarounds)

Both of these caused a silent multi-week sync stall that had to be fixed by hand
on 2026-06-15. The installer now bakes the fixes in.

### 1. Stable Python — Homebrew `python@3.12`, never Xcode/CLT

macOS ties Full Disk Access to the **exact interpreter binary**. On a clean Mac,
`python3` on `PATH` resolves to Apple's Xcode / Command Line Tools python
(`/usr/bin/python3`). Every time Xcode or the Command Line Tools update, that
file is replaced and macOS **silently revokes** the FDA grant. The nightly job
then still fires and **exits 0**, but every reader throws
`sqlite3.DatabaseError: authorization denied` and reads nothing — so the
watermark freezes and the app shows only stale data, with no error surfaced.

The installer builds the venv on Homebrew `python@3.12` (which survives Xcode
updates) and **refuses** to fall back to the Xcode/CLT python. Re-running the
installer also **heals** an existing install whose venv was built on the Xcode
python (it detects an Xcode/CLT `base_prefix` and rebuilds).

### 2. `/bin/zsh run.sh` wrapper, not a direct `exec` of the venv python

On Apple Silicon, `launchd` refuses to make an ad-hoc-signed Homebrew
interpreter a job's **main executable**: a direct
`ProgramArguments = [.venv/bin/python, -m, agent]` dies at spawn with
`OS_REASON_CODESIGNING` — even though `codesign --verify` passes. The fix is to
launch `/bin/zsh run.sh`, where `run.sh` `exec`s the venv python as a child
process. As a zsh child, the interpreter starts normally and its FDA grant
applies.

### Residual fragility

A manual `brew upgrade python@3.12` changes the interpreter's cdhash and would
require re-granting Full Disk Access (System Settings → Privacy & Security →
Full Disk Access → re-add `~/.net-work/agent/.venv/bin/python`). This is rare and
user-initiated — unlike the silent Xcode breakage it replaced.

## Durable long-term fix: a signed, notarized app

Both workarounds above exist only because the agent runs as an **ad-hoc-signed
Homebrew interpreter**. A properly **Developer-ID-signed and notarized,
self-contained app** removes them entirely:

- **No Homebrew dependency** — the Python runtime is bundled inside the app.
- **No `/bin/zsh` wrapper** — `launchd` will exec a Developer-ID-signed main
  executable directly.
- **Durable Full Disk Access** — TCC keys the grant to a stable code-signing
  identity, so OS/Xcode updates and app upgrades (re-signed with the same
  identity) don't silently revoke it.

Two viable shapes, both requiring an Apple Developer ID ($99/yr) and a
notarization step in the release pipeline:

1. **PyInstaller bundle** — package the existing Python agent (`agent.py`,
   `readers/`, deps) into a `.app` with `pyinstaller`, then
   `codesign --options runtime --sign "Developer ID Application: …"`,
   `xcrun notarytool submit … --wait`, and `xcrun stapler staple`. Smallest
   change from today's code; keeps the Python implementation.
2. **Small Swift menu-bar binary** — rewrite the readers in Swift against
   `Contacts.framework` / SQLite. More work, but the cleanest result: a tiny
   native binary, a real menu-bar UX for status/permissions, and the most
   durable TCC behavior.

Until one of those ships, the installer's Homebrew-python + `/bin/zsh` wrapper
approach is the supported path.
