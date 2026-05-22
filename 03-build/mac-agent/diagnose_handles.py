"""
Confirm: are pre-2020 outbound rows in chat.db missing handle_id?
And can we recover the recipient handle via chat_message_join → chat → handle?
"""
import os
import sqlite3
from collections import Counter

DB = os.path.expanduser("~/Library/Messages/chat.db")
con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
cur = con.cursor()

print("=" * 70)
print("1. Pre-2020 outbound: handle_id null vs not-null")
print("=" * 70)
for row in cur.execute("""
  SELECT
    CASE WHEN handle_id IS NULL OR handle_id = 0 THEN 'null/0' ELSE 'has handle_id' END AS state,
    COUNT(*)
  FROM message
  WHERE is_from_me = 1
    AND date < (strftime('%s','2020-01-07') - 978307200) * 1000000000
  GROUP BY state
"""):
    print(f"  {row[0]:<15} {row[1]:>8,}")

print()
print("=" * 70)
print("2. ALL outbound, by year × handle_id-null share")
print("=" * 70)
print(f"  {'year':>6}  {'null_handle':>12}  {'has_handle':>12}")
for row in cur.execute("""
  SELECT
    CAST(strftime('%Y', datetime((date/1000000000) + 978307200, 'unixepoch')) AS INTEGER) y,
    SUM(CASE WHEN handle_id IS NULL OR handle_id = 0 THEN 1 ELSE 0 END) nulls,
    SUM(CASE WHEN handle_id IS NOT NULL AND handle_id != 0 THEN 1 ELSE 0 END) has_h
  FROM message WHERE is_from_me = 1
  GROUP BY y ORDER BY y
"""):
    print(f"  {row[0]:>6}  {row[1]:>12,}  {row[2]:>12,}")

print()
print("=" * 70)
print("3. Can we recover handle via chat_message_join → chat?")
print("=" * 70)
sample = list(cur.execute("""
  SELECT m.ROWID, m.date, m.handle_id, m.service, m.text
  FROM message m
  WHERE m.is_from_me = 1
    AND (m.handle_id IS NULL OR m.handle_id = 0)
    AND m.date < (strftime('%s','2020-01-07') - 978307200) * 1000000000
  LIMIT 5
"""))
for r in sample:
    rowid, apple_ns, handle_id, service, text = r
    # Look up chat via chat_message_join
    chats = list(cur.execute("""
      SELECT c.ROWID, c.chat_identifier, c.service_name, c.display_name, c.style
      FROM chat_message_join cmj
      JOIN chat c ON c.ROWID = cmj.chat_id
      WHERE cmj.message_id = ?
    """, (rowid,)))
    # And via chat_handle_join, get the OTHER participant handles
    handles = []
    for c in chats:
        for h in cur.execute("""
          SELECT h.id
          FROM chat_handle_join chj
          JOIN handle h ON h.ROWID = chj.handle_id
          WHERE chj.chat_id = ?
        """, (c[0],)):
            handles.append(h[0])
    print(f"  rowid={rowid} svc={service} → {len(chats)} chats, handles={handles}, text={(text or '')[:40]!r}")
