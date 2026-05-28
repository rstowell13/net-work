"""
Diagnostic: investigate the pre-2020 outbound gap.

Run from the mac-agent install dir with the same Python that runs the agent:
  ~/.net-work/agent/.venv/bin/python ~/Projects/net-work/.claude/worktrees/upbeat-dijkstra-24b24b/03-build/mac-agent/diagnose_outbound.py

The interpreter must have Full Disk Access (System Settings → Privacy &
Security → Full Disk Access) to read ~/Library/Messages/chat.db.
"""

from __future__ import annotations

import os
import sqlite3
import sys
from collections import Counter

# Make sibling imports work whether run directly or via -m
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from readers import _attributed_body  # noqa: E402

DB = os.path.expanduser("~/Library/Messages/chat.db")


def main():
    if not os.path.exists(DB):
        print(f"ERROR: {DB} not found")
        sys.exit(1)

    con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    cur = con.cursor()

    print("=" * 60)
    print("1. Total counts in chat.db by direction")
    print("=" * 60)
    for row in cur.execute(
        "SELECT is_from_me, COUNT(*) FROM message GROUP BY is_from_me"
    ):
        label = "outbound" if row[0] else "inbound"
        print(f"  {label:10}  {row[1]:>10,}")

    print()
    print("=" * 60)
    print("2. Counts by direction × year (date column = nanoseconds-since-2001)")
    print("=" * 60)
    print(f"  {'year':>6}  {'inbound':>10}  {'outbound':>10}")
    for row in cur.execute(
        """
        SELECT
          CAST(strftime('%Y', datetime((date/1000000000) + 978307200, 'unixepoch')) AS INTEGER) y,
          SUM(CASE WHEN is_from_me=0 THEN 1 ELSE 0 END) inbound,
          SUM(CASE WHEN is_from_me=1 THEN 1 ELSE 0 END) outbound
        FROM message
        GROUP BY y
        ORDER BY y
        """
    ):
        if row[0] is None:
            continue
        print(f"  {row[0]:>6}  {row[1]:>10,}  {row[2]:>10,}")

    print()
    print("=" * 60)
    print("3. Pre-2020 outbound sample — what does the body look like?")
    print("=" * 60)
    rows = list(cur.execute(
        """
        SELECT
          ROWID, date, text, attributedBody, handle_id, service
        FROM message
        WHERE is_from_me = 1
          AND date < (strftime('%s','2020-01-01') - 978307200) * 1000000000
        ORDER BY date ASC
        LIMIT 15
        """
    ))
    print(f"  found {len(rows)} pre-2020 outbound rows in this sample")
    for r in rows:
        rowid, apple_ns, text, blob, handle_id, service = r
        unix = (apple_ns / 1_000_000_000) + 978307200
        from datetime import datetime, timezone
        dt = datetime.fromtimestamp(unix, tz=timezone.utc).isoformat()
        has_text = bool(text)
        text_preview = (text or "")[:50].replace("\n", "\\n")
        decoded = _attributed_body.extract_text(blob) if blob else None
        decoded_preview = (decoded or "")[:50].replace("\n", "\\n")
        print(
            f"  rowid={rowid:>8} {dt[:10]} service={service or '?':<8} "
            f"text={'Y' if has_text else 'N':1} blob={'Y' if blob else 'N':1} "
            f"decoded={'Y' if decoded else 'N':1} "
            f"| text={text_preview!r} | dec={decoded_preview!r}"
        )

    print()
    print("=" * 60)
    print("4. Pre-2020 outbound: body availability breakdown")
    print("=" * 60)
    breakdown = Counter()
    for r in cur.execute(
        """
        SELECT text, attributedBody, handle_id
        FROM message
        WHERE is_from_me = 1
          AND date < (strftime('%s','2020-01-07') - 978307200) * 1000000000
        """
    ):
        text, blob, handle_id = r
        no_handle = handle_id is None
        if text:
            kind = "has_text"
        elif blob:
            decoded = _attributed_body.extract_text(blob)
            kind = "decoded_blob" if decoded else "blob_no_decode"
        else:
            kind = "no_body_at_all"
        if no_handle:
            kind += "_no_handle"
        breakdown[kind] += 1
    total = sum(breakdown.values())
    print(f"  pre-2020 outbound total: {total:,}")
    for kind, n in breakdown.most_common():
        pct = 100 * n / total if total else 0
        print(f"    {kind:<30} {n:>10,}  ({pct:5.1f}%)")

    print()
    print("=" * 60)
    print("5. Pre-2020 inbound: body availability breakdown (for comparison)")
    print("=" * 60)
    breakdown = Counter()
    for r in cur.execute(
        """
        SELECT text, attributedBody, handle_id
        FROM message
        WHERE is_from_me = 0
          AND date < (strftime('%s','2020-01-07') - 978307200) * 1000000000
        """
    ):
        text, blob, handle_id = r
        no_handle = handle_id is None
        if text:
            kind = "has_text"
        elif blob:
            decoded = _attributed_body.extract_text(blob)
            kind = "decoded_blob" if decoded else "blob_no_decode"
        else:
            kind = "no_body_at_all"
        if no_handle:
            kind += "_no_handle"
        breakdown[kind] += 1
    total = sum(breakdown.values())
    print(f"  pre-2020 inbound total: {total:,}")
    for kind, n in breakdown.most_common():
        pct = 100 * n / total if total else 0
        print(f"    {kind:<30} {n:>10,}  ({pct:5.1f}%)")


if __name__ == "__main__":
    main()
