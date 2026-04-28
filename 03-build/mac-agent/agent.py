"""
net-work Mac agent — top-level entry point.

Run: python3 -m agent  (from the install dir)
or:   ~/.net-work/agent/.venv/bin/python -m agent

Reads three sources from the local Mac, pushes incremental diffs to
the web app's ingest endpoints. State is checkpointed in
~/.net-work/agent/state.json so subsequent runs only push new data.

Required env vars (loaded from ~/.net-work/agent/.env):
  NETWORK_API_BASE      e.g. https://net-work-rstowell13s-projects.vercel.app
  NETWORK_AGENT_TOKEN   bearer token from /settings/sources
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from pathlib import Path

LOG_DIR = Path.home() / ".net-work" / "agent"
LOG_DIR.mkdir(parents=True, exist_ok=True)
STATE_PATH = LOG_DIR / "state.json"
LOG_PATH = LOG_DIR / "agent.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    handlers=[
        logging.FileHandler(LOG_PATH),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger("net-work-agent")


def _load_env() -> dict:
    """Load .env from the install dir (parsed manually — no extra deps)."""
    env_path = LOG_DIR / ".env"
    out = dict(os.environ)
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" not in line:
                continue
            k, v = line.split("=", 1)
            out.setdefault(k.strip(), v.strip().strip('"'))
    return out


def _load_state() -> dict:
    if STATE_PATH.exists():
        return json.loads(STATE_PATH.read_text())
    return {"imessage_rowid": 0, "call_history_zdate": 0}


def _save_state(state: dict):
    STATE_PATH.write_text(json.dumps(state, indent=2))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--only",
        choices=["contacts", "messages", "calls"],
        action="append",
        help="Sync only the named source (repeatable). Default: all.",
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Discard local state and re-push everything.",
    )
    args = parser.parse_args()

    env = _load_env()
    base = env.get("NETWORK_API_BASE")
    token = env.get("NETWORK_AGENT_TOKEN")
    if not base or not token:
        log.error(
            "Missing NETWORK_API_BASE or NETWORK_AGENT_TOKEN. "
            "Did the installer write %s/.env?",
            LOG_DIR,
        )
        sys.exit(2)

    from pusher import Pusher

    pusher = Pusher(base_url=base, agent_token=token)

    state = {"imessage_rowid": 0, "call_history_zdate": 0} if args.reset else _load_state()
    selected = set(args.only) if args.only else {"contacts", "messages", "calls"}

    log.info("net-work agent starting · selected=%s · base=%s", sorted(selected), base)

    if "contacts" in selected:
        try:
            sync_contacts(pusher)
        except Exception:
            log.exception("contacts sync failed")

    if "messages" in selected:
        try:
            new_floor = sync_messages(pusher, state.get("imessage_rowid", 0))
            state["imessage_rowid"] = new_floor
            _save_state(state)
        except Exception:
            log.exception("messages sync failed")

    if "calls" in selected:
        try:
            new_floor = sync_calls(pusher, state.get("call_history_zdate", 0))
            state["call_history_zdate"] = new_floor
            _save_state(state)
        except Exception:
            log.exception("calls sync failed")

    log.info("net-work agent finished")


def sync_contacts(pusher):
    from readers import apple_contacts

    total = 0
    for batch in apple_contacts.iter_contacts(batch_size=50):
        result = pusher.push("contacts", batch)
        total += len(batch)
        log.info(
            "pushed %d contacts (server: new=%s updated=%s)",
            len(batch),
            result.get("recordsNew"),
            result.get("recordsUpdated"),
        )
    log.info("contacts done · pushed %d", total)


def sync_messages(pusher, rowid_floor: int) -> int:
    from readers import imessage

    msgs = imessage.read_messages_since(rowid_floor=rowid_floor)
    if not msgs:
        log.info("no new messages since rowid=%d", rowid_floor)
        return rowid_floor

    threads = imessage.group_into_threads(msgs)

    # Push messages and threads together as one payload (server sorts them out)
    BATCH = 500
    new_floor = max(m["rowid"] for m in msgs)
    for i in range(0, len(msgs), BATCH):
        chunk = msgs[i : i + BATCH]
        chunk_thread_ids = {
            t["external_thread_id"]
            for t in threads
            if any(eid in t["message_external_ids"] for eid in (m["external_id"] for m in chunk))
        }
        threads_subset = [t for t in threads if t["external_thread_id"] in chunk_thread_ids]
        result = pusher.push(
            "messages",
            [{"messages": chunk, "threads": threads_subset}],  # batch wraps a single payload object
        )
        log.info(
            "pushed %d messages / %d threads (server: new=%s)",
            len(chunk),
            len(threads_subset),
            result.get("recordsNew"),
        )
    log.info("messages done · pushed %d msgs %d threads · new floor=%d", len(msgs), len(threads), new_floor)
    return new_floor


def sync_calls(pusher, z_date_floor: int) -> int:
    from readers import call_history

    if not call_history.is_available():
        log.info("CallHistory.storedata not present — skipping call log sync")
        return z_date_floor

    calls = call_history.read_calls_since(z_date_floor=z_date_floor)
    if not calls:
        log.info("no new calls since zdate=%d", z_date_floor)
        return z_date_floor

    new_floor = max(c["z_date"] for c in calls)
    BATCH = 500
    for i in range(0, len(calls), BATCH):
        chunk = calls[i : i + BATCH]
        result = pusher.push("calls", chunk)
        log.info(
            "pushed %d calls (server: new=%s)",
            len(chunk),
            result.get("recordsNew"),
        )
    log.info("calls done · pushed %d · new floor=%d", len(calls), new_floor)
    return new_floor


if __name__ == "__main__":
    main()
