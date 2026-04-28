"""
iMessage reader.

Reads ~/Library/Messages/chat.db (read-only) and groups messages into
threads using the 8-hour-gap rule defined in DATA_MODEL.md.

Requires Full Disk Access on the Python interpreter that runs this
(System Settings → Privacy & Security → Full Disk Access).
"""

from __future__ import annotations

import os
import sqlite3
from typing import Iterator

from . import _attributed_body

DEFAULT_DB_PATH = os.path.expanduser("~/Library/Messages/chat.db")
EIGHT_HOURS_NS = 8 * 60 * 60 * 1_000_000_000  # iMessage uses Apple epoch nanoseconds

# Apple epoch is 2001-01-01. Apple stores message.date as nanoseconds since
# Apple epoch in modern macOS (≥ Big Sur). The conversion to unix:
#   unix_seconds = (apple_ns / 1e9) + 978307200
APPLE_EPOCH_OFFSET_S = 978_307_200


def _apple_ns_to_unix_ms(apple_ns: int) -> int:
    if apple_ns == 0:
        return 0
    return int(apple_ns / 1_000_000) + APPLE_EPOCH_OFFSET_S * 1000


def read_messages_since(
    rowid_floor: int = 0,
    db_path: str | None = None,
    stats: dict | None = None,
) -> list[dict]:
    """
    Read all iMessage / SMS messages with ROWID > rowid_floor.
    Returns rows ordered by ROWID asc so the agent can checkpoint.

    Each row:
      external_id (= guid), handle (phone or email), body, sent_at_ms,
      direction ("inbound"|"outbound"), channel ("imessage"|"sms"),
      rowid (int — used as watermark)

    If `stats` is provided it will be populated with per-source counts
    (text_only, attributed_only, no_handle, skipped_no_body, scanned).
    """
    path = db_path or DEFAULT_DB_PATH
    if not os.path.exists(path):
        raise FileNotFoundError(
            f"iMessage database not found at {path}. "
            "Has Full Disk Access been granted to this Python interpreter?"
        )

    counters = {"scanned": 0, "text_only": 0, "attributed_only": 0, "skipped_no_body": 0, "no_handle": 0}

    # Read-only connection. URI mode lets us specify mode=ro.
    uri = f"file:{path}?mode=ro"
    con = sqlite3.connect(uri, uri=True)
    con.row_factory = sqlite3.Row
    try:
        cur = con.cursor()
        # NOTE: no `text IS NOT NULL` filter. On modern macOS most iMessages
        # carry their body in `attributedBody` (a typedstream blob) and have
        # NULL `text`. We decode `attributedBody` in Python below.
        cur.execute(
            """
            SELECT
              m.ROWID            as rowid,
              m.guid             as guid,
              m.text             as body,
              m.attributedBody   as attributed_body,
              m.date             as apple_ns,
              m.is_from_me       as is_from_me,
              m.service          as service,
              h.id               as handle
            FROM message m
            LEFT JOIN handle h ON h.ROWID = m.handle_id
            WHERE m.ROWID > ?
            ORDER BY m.ROWID ASC
            """,
            (rowid_floor,),
        )
        out: list[dict] = []
        for r in cur.fetchall():
            counters["scanned"] += 1
            text = r["body"]
            if text and len(text) > 0:
                body = text
                counters["text_only"] += 1
            else:
                decoded = _attributed_body.extract_text(r["attributed_body"])
                if decoded:
                    body = decoded
                    counters["attributed_only"] += 1
                else:
                    # Tapback / sticker / attachment-only / undecodable — skip.
                    counters["skipped_no_body"] += 1
                    continue

            handle = r["handle"] or ""
            if not handle:
                # Group-chat messages (no 1:1 handle) — skip for now; the
                # current schema keys threads on handle, so these would
                # collapse into one bogus thread.
                counters["no_handle"] += 1
                continue

            channel = "imessage" if (r["service"] or "iMessage") == "iMessage" else "sms"
            out.append(
                {
                    "rowid": r["rowid"],
                    "external_id": r["guid"],
                    "handle": handle,
                    "body": body,
                    "sent_at_ms": _apple_ns_to_unix_ms(r["apple_ns"] or 0),
                    "direction": "outbound" if r["is_from_me"] else "inbound",
                    "channel": channel,
                }
            )
        if stats is not None:
            stats.update(counters)
        return out
    finally:
        con.close()


def group_into_threads(messages: list[dict]) -> list[dict]:
    """
    Apply the 8-hour gap rule: a new thread starts whenever the time
    between two consecutive messages with the same handle exceeds 8h.

    Returns a list of thread dicts:
      handle, started_at_ms, ended_at_ms, message_count,
      external_thread_id (= "<handle>:<started_at_ms>"),
      message_external_ids: [...]
    """
    by_handle: dict[str, list[dict]] = {}
    for m in messages:
        by_handle.setdefault(m["handle"], []).append(m)

    threads: list[dict] = []
    for handle, msgs in by_handle.items():
        msgs.sort(key=lambda x: x["sent_at_ms"])
        if not msgs:
            continue
        cur: list[dict] = [msgs[0]]
        for prev, this in zip(msgs, msgs[1:]):
            if (this["sent_at_ms"] - prev["sent_at_ms"]) >= EIGHT_HOURS_NS / 1_000_000:
                threads.append(_finalize_thread(handle, cur))
                cur = [this]
            else:
                cur.append(this)
        threads.append(_finalize_thread(handle, cur))
    threads.sort(key=lambda t: t["started_at_ms"])
    return threads


def _finalize_thread(handle: str, msgs: list[dict]) -> dict:
    started = msgs[0]["sent_at_ms"]
    ended = msgs[-1]["sent_at_ms"]
    return {
        "external_thread_id": f"{handle}:{started}",
        "handle": handle,
        "started_at_ms": started,
        "ended_at_ms": ended,
        "message_count": len(msgs),
        "message_external_ids": [m["external_id"] for m in msgs],
    }


def iter_batches(rowid_floor: int = 0, batch_size: int = 500) -> Iterator[list[dict]]:
    """Yield batches of messages — convenient for the pusher."""
    msgs = read_messages_since(rowid_floor=rowid_floor)
    for i in range(0, len(msgs), batch_size):
        yield msgs[i : i + batch_size]
