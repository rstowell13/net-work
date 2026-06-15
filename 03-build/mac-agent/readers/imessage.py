"""
iMessage reader.

Reads ~/Library/Messages/chat.db (read-only) and groups messages into
threads using the 8-hour-gap rule defined in DATA_MODEL.md.

Group chats: each message is classified as 1-on-1 or group by the participant
count of the macOS chat it belongs to. 1-on-1 messages key threads on the other
party's handle (as before). Group messages key threads on the chat id so a whole
group conversation forms one thread, and carry the full participant roster so the
web app can surface the thread on every participant's contact page.

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


def _load_chat_meta(cur: sqlite3.Cursor) -> dict[int, dict]:
    """
    Build {chat_rowid: {group_chat_id, display_name, participants:[handles]}}.

    chat_handle_join lists the OTHER participants of a chat (not "me"), so a
    1-on-1 chat has exactly one participant handle and a group chat has ≥2.
    """
    meta: dict[int, dict] = {}
    cur.execute("SELECT ROWID, guid, chat_identifier, display_name FROM chat")
    for r in cur.fetchall():
        rowid = r["ROWID"]
        gid = r["guid"] or r["chat_identifier"] or f"rowid:{rowid}"
        meta[rowid] = {
            "group_chat_id": gid,
            "display_name": r["display_name"] or None,
            "participants": [],
        }
    cur.execute(
        """
        SELECT chj.chat_id AS chat_id, h.id AS handle
        FROM chat_handle_join chj
        JOIN handle h ON h.ROWID = chj.handle_id
        """
    )
    for r in cur.fetchall():
        m = meta.get(r["chat_id"])
        if m is not None and r["handle"]:
            if r["handle"] not in m["participants"]:
                m["participants"].append(r["handle"])
    return meta


def read_messages_since(
    rowid_floor: int = 0,
    db_path: str | None = None,
    stats: dict | None = None,
) -> list[dict]:
    """
    Read all iMessage / SMS messages with ROWID > rowid_floor.
    Returns rows ordered by ROWID asc so the agent can checkpoint.

    Each row:
      external_id (= guid), handle (the 1-on-1 other party, or — for group
      messages — the inbound sender; "" for the user's own group replies),
      body, sent_at_ms, direction ("inbound"|"outbound"),
      channel ("imessage"|"sms"), rowid (int — watermark),
      is_group (bool), sender_handle (group inbound sender or None),
      group_chat_id / group_display_name / participant_handles (group only).

    If `stats` is provided it will be populated with per-source counts
    (text_only, attributed_only, no_handle, skipped_no_body, scanned,
    recovered_handle, group_kept, group_chats).
    """
    path = db_path or DEFAULT_DB_PATH
    if not os.path.exists(path):
        raise FileNotFoundError(
            f"iMessage database not found at {path}. "
            "Has Full Disk Access been granted to this Python interpreter?"
        )

    counters = {
        "scanned": 0,
        "text_only": 0,
        "attributed_only": 0,
        "skipped_no_body": 0,
        "no_handle": 0,
        "recovered_handle": 0,
        "group_kept": 0,
        "group_chats": 0,
    }
    group_chat_ids: set[str] = set()

    # Read-only connection. URI mode lets us specify mode=ro.
    uri = f"file:{path}?mode=ro"
    con = sqlite3.connect(uri, uri=True)
    con.row_factory = sqlite3.Row
    try:
        cur = con.cursor()

        # Per-chat participant rosters / identifiers — used to classify each
        # message as 1-on-1 vs group and to recover the 1-on-1 other-party
        # handle for outbound messages (which have message.handle_id = NULL).
        chat_meta = _load_chat_meta(cur)

        # NOTE: no `text IS NOT NULL` filter. On modern macOS most iMessages
        # carry their body in `attributedBody` (a typedstream blob) and have
        # NULL `text`. We decode `attributedBody` in Python below.
        #
        # `handle_direct` is the sender for inbound messages (both 1-on-1 and
        # group). `chat_rowid` is the chat the message belongs to (MIN() picks
        # one deterministically if a message is in multiple chats); we look up
        # participant count / chat id / display name from chat_meta.
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
              h.id               as handle_direct,
              pick.chat_id       as chat_rowid
            FROM message m
            LEFT JOIN handle h ON h.ROWID = m.handle_id
            LEFT JOIN (
              SELECT cmj.message_id AS message_id, MIN(cmj.chat_id) AS chat_id
              FROM chat_message_join cmj
              GROUP BY cmj.message_id
            ) pick ON pick.message_id = m.ROWID
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

            meta = chat_meta.get(r["chat_rowid"]) if r["chat_rowid"] is not None else None
            participants = meta["participants"] if meta else []
            is_group = len(participants) > 1
            channel = "imessage" if (r["service"] or "iMessage") == "iMessage" else "sms"
            is_from_me = bool(r["is_from_me"])
            direction = "outbound" if is_from_me else "inbound"

            if is_group:
                # Keep group messages (1-on-1 attribution would be wrong). The
                # inbound sender is handle_direct; the user's own replies have no
                # sender handle. The thread is keyed on the chat, not a handle.
                sender_handle = r["handle_direct"] or None
                out.append(
                    {
                        "rowid": r["rowid"],
                        "external_id": r["guid"],
                        "handle": sender_handle or "",  # raw_contact for inbound sender only
                        "body": body,
                        "sent_at_ms": _apple_ns_to_unix_ms(r["apple_ns"] or 0),
                        "direction": direction,
                        "channel": channel,
                        "is_group": True,
                        "sender_handle": sender_handle,
                        "group_chat_id": meta["group_chat_id"],
                        "group_display_name": meta["display_name"],
                        "participant_handles": participants,
                    }
                )
                counters["group_kept"] += 1
                group_chat_ids.add(meta["group_chat_id"])
                continue

            # 1-on-1. handle_direct is the other party for inbound; for outbound
            # (handle_id NULL) recover it from the chat's single participant.
            handle = r["handle_direct"] or ""
            if not handle and participants:
                handle = participants[0]
                counters["recovered_handle"] += 1
            if not handle:
                # No 1-on-1 handle and not a group chat — orphan; skip.
                counters["no_handle"] += 1
                continue

            out.append(
                {
                    "rowid": r["rowid"],
                    "external_id": r["guid"],
                    "handle": handle,
                    "body": body,
                    "sent_at_ms": _apple_ns_to_unix_ms(r["apple_ns"] or 0),
                    "direction": direction,
                    "channel": channel,
                    "is_group": False,
                    "sender_handle": None,
                    "group_chat_id": None,
                    "group_display_name": None,
                    "participant_handles": None,
                }
            )
        counters["group_chats"] = len(group_chat_ids)
        if stats is not None:
            stats.update(counters)
        return out
    finally:
        con.close()


def group_into_threads(messages: list[dict]) -> list[dict]:
    """
    Apply the 8-hour gap rule: a new thread starts whenever the time between two
    consecutive messages with the same key exceeds 8h.

    1-on-1 messages are keyed on `handle`; group messages on `group_chat_id`, so
    a whole group conversation forms one thread (per 8h burst) rather than one
    fragment per sender.

    Returns a list of thread dicts:
      external_thread_id, handle (NULL for group), started_at_ms, ended_at_ms,
      message_count, message_external_ids, is_group, group_chat_id,
      group_display_name, participant_handles.
    """
    buckets: dict[tuple[str, str], list[dict]] = {}
    for m in messages:
        if m.get("is_group"):
            key = ("g", m["group_chat_id"])
        else:
            key = ("h", m["handle"])
        buckets.setdefault(key, []).append(m)

    threads: list[dict] = []
    for (kind, key), msgs in buckets.items():
        msgs.sort(key=lambda x: x["sent_at_ms"])
        if not msgs:
            continue
        cur: list[dict] = [msgs[0]]
        for prev, this in zip(msgs, msgs[1:]):
            if (this["sent_at_ms"] - prev["sent_at_ms"]) >= EIGHT_HOURS_NS / 1_000_000:
                threads.append(_finalize_thread(kind, key, cur))
                cur = [this]
            else:
                cur.append(this)
        threads.append(_finalize_thread(kind, key, cur))
    threads.sort(key=lambda t: t["started_at_ms"])
    return threads


def _finalize_thread(kind: str, key: str, msgs: list[dict]) -> dict:
    started = msgs[0]["sent_at_ms"]
    ended = msgs[-1]["sent_at_ms"]
    is_group = kind == "g"
    if is_group:
        roster = sorted(
            {h for m in msgs for h in (m.get("participant_handles") or [])}
        )
        display_name = next(
            (m["group_display_name"] for m in msgs if m.get("group_display_name")),
            None,
        )
        return {
            "external_thread_id": f"group:{key}:{started}",
            "handle": None,
            "started_at_ms": started,
            "ended_at_ms": ended,
            "message_count": len(msgs),
            "message_external_ids": [m["external_id"] for m in msgs],
            "is_group": True,
            "group_chat_id": key,
            "group_display_name": display_name,
            "participant_handles": roster,
        }
    return {
        "external_thread_id": f"{key}:{started}",
        "handle": key,
        "started_at_ms": started,
        "ended_at_ms": ended,
        "message_count": len(msgs),
        "message_external_ids": [m["external_id"] for m in msgs],
        "is_group": False,
        "group_chat_id": None,
        "group_display_name": None,
        "participant_handles": None,
    }


def iter_batches(rowid_floor: int = 0, batch_size: int = 500) -> Iterator[list[dict]]:
    """Yield batches of messages — convenient for the pusher."""
    msgs = read_messages_since(rowid_floor=rowid_floor)
    for i in range(0, len(msgs), batch_size):
        yield msgs[i : i + batch_size]
