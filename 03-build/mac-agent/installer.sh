#!/usr/bin/env bash
#
# net-work Mac agent — one-line installer.
#
# Usage (from /settings/sources, with token + base URL pre-templated):
#   curl -fsSL https://raw.githubusercontent.com/rstowell13/net-work/main/03-build/mac-agent/installer.sh | \
#     NETWORK_AGENT_TOKEN=<token> NETWORK_API_BASE=<url> bash
#
# Idempotent: re-running upgrades the install in place (and HEALS an install whose
# venv was built on Xcode/CLT python — see select_stable_python below).
#
# Hardening notes (why this script is the way it is):
#   * The venv is built on Homebrew python@3.12, never Apple's Xcode/CLT
#     /usr/bin/python3 — macOS silently revokes Full Disk Access from the Xcode
#     python on every Xcode/CLT update, which stalls iMessage sync.
#   * The LaunchAgent runs `/bin/zsh run.sh` instead of execing the venv python
#     directly — Apple-Silicon launchd kills a direct exec at spawn with
#     OS_REASON_CODESIGNING (ad-hoc-signed Homebrew interpreter).
#   The durable long-term fix (a Developer-ID-signed, notarized app) removes both
#   workarounds; see README.md in this directory.

set -euo pipefail

INSTALL_DIR="$HOME/.net-work/agent"
REPO_RAW="https://raw.githubusercontent.com/rstowell13/net-work/main/03-build/mac-agent"
PLIST_NAME="net.work.agent"
PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_NAME}.plist"

echo "==> net-work mac agent installer"

if [[ -z "${NETWORK_AGENT_TOKEN:-}" || -z "${NETWORK_API_BASE:-}" ]]; then
  echo "ERROR: NETWORK_AGENT_TOKEN and NETWORK_API_BASE must be set." >&2
  exit 1
fi

# --- stable Python (NEVER Xcode/CLT) ---------------------------------------
# Prefer Homebrew python@3.12 and install it if Homebrew is present but the
# formula is missing. Refuse to fall back to Apple's /usr/bin/python3 (the
# Xcode/CLT shim): macOS ties Full Disk Access to the exact interpreter binary,
# and every Xcode/CLT update replaces that file and silently revokes the grant,
# so the nightly job exits 0 but reads nothing and iMessage sync goes stale.
select_stable_python() {
  command -v brew >/dev/null 2>&1 || return 1
  local prefix
  prefix="$(brew --prefix python@3.12 2>/dev/null || true)"
  if [[ -z "$prefix" || ! -x "$prefix/bin/python3.12" ]]; then
    echo "==> installing Homebrew python@3.12 (stable interpreter for the agent)" >&2
    brew install python@3.12 >&2
    prefix="$(brew --prefix python@3.12 2>/dev/null || true)"
  fi
  [[ -n "$prefix" && -x "$prefix/bin/python3.12" ]] || return 1
  printf '%s\n' "$prefix/bin/python3.12"
}

if ! PYTHON_BIN="$(select_stable_python)"; then
  cat >&2 <<'NOPY'
ERROR: could not provision a stable Python for the agent.

This installer refuses to build the agent on Apple's Xcode / Command Line Tools
python (/usr/bin/python3): macOS silently revokes its Full Disk Access whenever
those tools update, which stalls iMessage sync.

Fix: install Homebrew (https://brew.sh), then re-run this installer — it will
install and use python@3.12 automatically. (Advanced: a python.org python3.12
also works; point the venv at it manually.)
NOPY
  exit 1
fi

# Defense in depth: never let the resolved interpreter be the Xcode/CLT one.
case "$("$PYTHON_BIN" -c 'import sys; print(sys.base_prefix)' 2>/dev/null)" in
  *Xcode.app*|*/CommandLineTools/*)
    echo "ERROR: refusing to use Xcode/CLT python: $PYTHON_BIN" >&2
    exit 1 ;;
esac
echo "==> using stable python: $PYTHON_BIN"

mkdir -p "$INSTALL_DIR/readers"
echo "==> downloading agent source into $INSTALL_DIR"
for f in agent.py pusher.py requirements.txt; do
  curl -fsSL "$REPO_RAW/$f" -o "$INSTALL_DIR/$f"
done
for f in __init__.py apple_contacts.py imessage.py call_history.py _attributed_body.py; do
  curl -fsSL "$REPO_RAW/readers/$f" -o "$INSTALL_DIR/readers/$f"
done

echo "==> provisioning venv on $PYTHON_BIN"
need_venv=1
if [[ -x "$INSTALL_DIR/.venv/bin/python" ]]; then
  base="$("$INSTALL_DIR/.venv/bin/python" -c 'import sys; print(sys.base_prefix)' 2>/dev/null || true)"
  case "$base" in
    *Xcode.app*|*/CommandLineTools/*)
      echo "==> existing venv is built on Xcode/CLT python — rebuilding (this is the silent-stall bug)" ;;
    "")
      echo "==> existing venv interpreter is broken — rebuilding" ;;
    *)
      echo "==> reusing existing stable venv (base: $base)"
      need_venv=0 ;;
  esac
fi
if [[ "$need_venv" -eq 1 ]]; then
  rm -rf "$INSTALL_DIR/.venv"
  "$PYTHON_BIN" -m venv "$INSTALL_DIR/.venv"
fi
"$INSTALL_DIR/.venv/bin/pip" install --quiet --upgrade pip
"$INSTALL_DIR/.venv/bin/pip" install --quiet -r "$INSTALL_DIR/requirements.txt"

echo "==> writing $INSTALL_DIR/.env"
chmod 700 "$INSTALL_DIR"
cat > "$INSTALL_DIR/.env" <<EOF
NETWORK_API_BASE=$NETWORK_API_BASE
NETWORK_AGENT_TOKEN=$NETWORK_AGENT_TOKEN
EOF
chmod 600 "$INSTALL_DIR/.env"

echo "==> writing launch wrapper $INSTALL_DIR/run.sh"
cat > "$INSTALL_DIR/run.sh" <<'RUNSH'
#!/bin/zsh
# Launch wrapper for the net-work agent.
# Apple-Silicon launchd refuses to make the ad-hoc-signed Homebrew venv python a
# job's main executable — a direct exec dies at spawn with OS_REASON_CODESIGNING
# even though `codesign --verify` passes. Running python as a child of /bin/zsh
# sidesteps that while still using the venv interpreter that holds Full Disk Access.
cd "$HOME/.net-work/agent" || exit 1
exec ./.venv/bin/python -m agent
RUNSH
chmod +x "$INSTALL_DIR/run.sh"

echo "==> writing LaunchAgent at $PLIST_PATH"
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>          <string>${PLIST_NAME}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>${INSTALL_DIR}/run.sh</string>
  </array>
  <key>WorkingDirectory</key>  <string>${INSTALL_DIR}</string>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>   <integer>2</integer>
    <key>Minute</key> <integer>0</integer>
  </dict>
  <key>StandardOutPath</key>   <string>${INSTALL_DIR}/agent.log</string>
  <key>StandardErrorPath</key> <string>${INSTALL_DIR}/agent.err</string>
  <key>RunAtLoad</key>         <true/>
</dict>
</plist>
EOF

echo "==> bootstrapping LaunchAgent"
launchctl bootout "gui/$(id -u)/${PLIST_NAME}" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_PATH"
launchctl kickstart -k "gui/$(id -u)/${PLIST_NAME}" 2>/dev/null || true

cat <<EOM

==> install complete

Next: grant Full Disk Access + Contacts permission to:
  $INSTALL_DIR/.venv/bin/python

  System Settings → Privacy & Security → Full Disk Access  → click + → add the path above
  System Settings → Privacy & Security → Contacts          → enable for Terminal (or for python if shown)

For a complete iMessage history (recommended before first sync):
  System Settings → [Your Name] → iCloud → Messages on iCloud → SYNC NOW
  Also: turn OFF "Optimize Mac Storage" so older messages live on disk,
  not just in iCloud. Without this, chat.db only contains recent messages.

To trigger an immediate sync (after permissions are granted):
  cd "$INSTALL_DIR" && ./.venv/bin/python -m agent

To re-push the entire history from scratch (idempotent — server dedups by message GUID):
  cd "$INSTALL_DIR" && ./.venv/bin/python -m agent --reset

To watch the log:
  tail -f "$INSTALL_DIR/agent.log"

To stop the LaunchAgent:
  launchctl bootout "gui/\$(id -u)/${PLIST_NAME}"

To verify the SCHEDULED job works — NOT a direct run, which borrows this shell's
Full Disk Access and gives a false pass:
  launchctl kickstart -k "gui/\$(id -u)/${PLIST_NAME}"
  grep -iE "authorization denied|OS_REASON_CODESIGNING" "$INSTALL_DIR/agent.err"   # expect NO matches
  cat "$INSTALL_DIR/state.json"   # imessage_rowid should advance run-over-run

Durable long-term fix (removes the Homebrew dependency AND the /bin/zsh wrapper):
  ship the agent as a Developer-ID-signed, notarized app — see README.md here.
EOM
