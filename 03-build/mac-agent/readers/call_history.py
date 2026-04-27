"""
Call History reader.

Reads ~/Library/Application Support/CallHistoryDB/CallHistory.storedata
when present (it is via macOS Continuity if the user has iPhone-syncing
enabled). If absent, returns an empty list — call-log support degrades
gracefully per BRIEF M3.1.

Requires Full Disk Access.
"""

from __future__ import annotations

import os
import sqlite3
from typing import Iterator

DEFAULT_DB_PATH = os.path.expanduser(
    "~/Library/Application Support/CallHistoryDB/CallHistory.storedata"
)

# Same Apple epoch as iMessage; ZDATE is seconds (not nanoseconds) from
# 2001-01-01. unix_seconds = ZDATE + 978307200.
APPLE_EPOCH_OFFSET_S = 978_307_200


def is_available(db_path: str | None = None) -> bool:
    return os.path.exists(db_path or DEFAULT_DB_PATH)


def read_calls_since(z_date_floor: int = 0, db_path: str | None = None) -> list[dict]:
    """
    Returns calls with ZDATE > z_date_floor (Apple epoch seconds), oldest first.
    Each row: external_id, handle, started_at_ms, duration_seconds, direction.
    """
    path = db_path or DEFAULT_DB_PATH
    if not os.path.exists(path):
        return []

    uri = f"file:{path}?mode=ro"
    con = sqlite3.connect(uri, uri=True)
    con.row_factory = sqlite3.Row
    try:
        cur = con.cursor()
        # ZCALLRECORD columns: ZADDRESS (handle), ZDATE, ZDURATION,
        # ZORIGINATED (1 = outbound, 0 = inbound), ZANSWERED, ZUNIQUE_ID.
        cur.execute(
            """
            SELECT
              ZUNIQUE_ID  as guid,
              ZADDRESS    as handle,
              ZDATE       as z_date,
              ZDURATION   as duration_s,
              ZORIGINATED as originated,
              ZANSWERED   as answered
            FROM ZCALLRECORD
            WHERE ZDATE > ?
            ORDER BY ZDATE ASC
            """,
            (z_date_floor,),
        )
        out: list[dict] = []
        for r in cur.fetchall():
            if not r["guid"]:
                continue
            unix_ms = (int(r["z_date"]) + APPLE_EPOCH_OFFSET_S) * 1000
            if r["originated"]:
                direction = "outbound"
            elif not r["answered"]:
                direction = "missed"
            else:
                direction = "inbound"
            out.append(
                {
                    "z_date": int(r["z_date"]),
                    "external_id": r["guid"],
                    "handle": (r["handle"] or "").strip(),
                    "started_at_ms": unix_ms,
                    "duration_seconds": int(r["duration_s"] or 0),
                    "direction": direction,
                }
            )
        return out
    finally:
        con.close()


def iter_batches(z_date_floor: int = 0, batch_size: int = 500) -> Iterator[list[dict]]:
    calls = read_calls_since(z_date_floor=z_date_floor)
    for i in range(0, len(calls), batch_size):
        yield calls[i : i + batch_size]
