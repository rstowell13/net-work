"""
Minimal NSKeyedArchiver / typedstream decoder for `message.attributedBody`.

On modern macOS (Big Sur+), iMessage usually stores the message body in
`message.attributedBody` (a binary typedstream blob produced by
`NSAttributedString`) rather than the plain `message.text` column. The plain
`text` column is mostly populated only for SMS and older iMessages, so a
naive reader that filters on `text IS NOT NULL` drops the vast majority of
modern iMessages.

This module extracts the plain string from the blob without any third-party
dependency. It is *not* a full typedstream parser — it is the same pragmatic
byte-walking heuristic used by `imessage-exporter`, `imessage-tools`, and
similar pure-Python projects: find the `NSString` (or `NSMutableString`)
class marker, then read the variable-length-prefixed UTF-8 payload that
follows the next `+` opcode.

Length encoding inside typedstream:
  byte n  < 0x81  → length is n itself
  byte n == 0x81 → next 2 bytes (little-endian) are the length
  byte n == 0x82 → next 4 bytes (little-endian) are the length
"""

from __future__ import annotations


_CLASS_MARKERS = (b"NSMutableString", b"NSString")


def extract_text(blob: bytes | None) -> str | None:
    """Best-effort: return the message body string, or None if not found."""
    if not blob:
        return None

    # Find the earliest class marker. Prefer NSMutableString (more specific),
    # fall back to NSString.
    marker_idx = -1
    for marker in _CLASS_MARKERS:
        i = blob.find(marker)
        if i >= 0:
            marker_idx = i
            break
    if marker_idx < 0:
        return None

    # The actual string follows a `+` (0x2B) opcode that comes after the
    # class definition. Multiple `+` bytes can appear between the marker and
    # the payload (class hierarchy, version markers), and 0x2B can also occur
    # inside the UTF-8 payload itself. So: try each `+` in order and accept
    # the first one whose length-prefix yields a clean UTF-8 string that
    # doesn't look like a class name.
    cursor = marker_idx + 1
    while True:
        plus = blob.find(b"+", cursor)
        if plus < 0:
            return None
        candidate = _try_read_string_at(blob, plus + 1)
        if candidate is not None:
            return candidate
        cursor = plus + 1


def _try_read_string_at(blob: bytes, p: int) -> str | None:
    if p >= len(blob):
        return None
    n = blob[p]
    p += 1
    if n == 0x81:
        if p + 2 > len(blob):
            return None
        n = int.from_bytes(blob[p:p + 2], "little")
        p += 2
    elif n == 0x82:
        if p + 4 > len(blob):
            return None
        n = int.from_bytes(blob[p:p + 4], "little")
        p += 4
    elif n >= 0x80:
        # Reserved / unknown — bail
        return None

    if n <= 0 or p + n > len(blob):
        return None

    raw = blob[p:p + n]
    try:
        s = raw.decode("utf-8")
    except UnicodeDecodeError:
        return None

    # Reject obvious class-name fragments that occasionally land here.
    if not s:
        return None
    if s.startswith("NS") or s.startswith("__kIM") or s == "iI":
        return None
    # Reject strings that are entirely non-printable.
    if not any(ch.isprintable() or ch in ("\n", "\t") for ch in s):
        return None
    return s
