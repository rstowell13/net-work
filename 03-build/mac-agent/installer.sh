#!/usr/bin/env bash
#
# net-work Mac agent — one-line installer.
#
# Usage (from /settings/sources, with token + base URL pre-templated):
#   curl -fsSL https://raw.githubusercontent.com/rstowell13/net-work/main/03-build/mac-agent/installer.sh | \
#     NETWORK_AGENT_TOKEN=<token> NETWORK_API_BASE=<url> bash
#
# Idempotent: re-running upgrades the install in place.

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

if ! command -v python3 >/dev/null 2>&1; then
  echo "ERROR: python3 not found. Install Python 3.11+ (e.g. via Homebrew or python.org)." >&2
  exit 1
fi

mkdir -p "$INSTALL_DIR/readers"
echo "==> downloading agent source into $INSTALL_DIR"
for f in agent.py pusher.py requirements.txt; do
  curl -fsSL "$REPO_RAW/$f" -o "$INSTALL_DIR/$f"
done
for f in __init__.py apple_contacts.py imessage.py call_history.py; do
  curl -fsSL "$REPO_RAW/readers/$f" -o "$INSTALL_DIR/readers/$f"
done

echo "==> creating venv (one-time)"
if [[ ! -d "$INSTALL_DIR/.venv" ]]; then
  python3 -m venv "$INSTALL_DIR/.venv"
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
    <string>${INSTALL_DIR}/.venv/bin/python</string>
    <string>-m</string>
    <string>agent</string>
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

To trigger an immediate sync (after permissions are granted):
  cd "$INSTALL_DIR" && ./.venv/bin/python -m agent

To watch the log:
  tail -f "$INSTALL_DIR/agent.log"

To stop the LaunchAgent:
  launchctl bootout "gui/\$(id -u)/${PLIST_NAME}"
EOM
