"""
Apple Contacts reader.

Uses the Contacts framework via pyobjc. Requires the user to grant
"Contacts" permission to the Python interpreter (System Settings →
Privacy & Security → Contacts).

Returns a list of dicts ready for the web ingestion endpoint.
"""

from __future__ import annotations

import base64
import io
import logging
from typing import Iterator

import Contacts  # type: ignore[import-not-found]
from PIL import Image  # type: ignore[import-not-found]

log = logging.getLogger(__name__)

# Resize each photo to a square JPEG of this side, max. 256x256 ~= 20-30KB
# at quality 80 — safely under Vercel's 4MB request cap even at batch=50.
PHOTO_TARGET_SIDE = 256
PHOTO_JPEG_QUALITY = 80


CONTACT_KEYS = [
    Contacts.CNContactIdentifierKey,
    Contacts.CNContactGivenNameKey,
    Contacts.CNContactFamilyNameKey,
    Contacts.CNContactOrganizationNameKey,
    Contacts.CNContactEmailAddressesKey,
    Contacts.CNContactPhoneNumbersKey,
    Contacts.CNContactImageDataAvailableKey,
    Contacts.CNContactImageDataKey,
    Contacts.CNContactUrlAddressesKey,
]


def read_contacts() -> list[dict]:
    """Read all contacts from the user's Contacts app."""
    store = Contacts.CNContactStore.alloc().init()
    request = Contacts.CNContactFetchRequest.alloc().initWithKeysToFetch_(CONTACT_KEYS)

    out: list[dict] = []

    def handler(contact, _stop):
        out.append(_serialize(contact))

    # Cocoa selector: -[CNContactStore enumerateContactsWithFetchRequest:error:usingBlock:]
    # PyObjC translates `usingBlock:` → `_usingBlock_` (NOT `_handler_`).
    success, error = store.enumerateContactsWithFetchRequest_error_usingBlock_(
        request, None, handler
    )
    if not success:
        raise RuntimeError(
            f"CNContactStore enumeration failed: {error.localizedDescription() if error else 'unknown error'}. "
            "Check that Contacts permission is granted to this Python interpreter."
        )
    return out


def _serialize(contact) -> dict:
    full_name = " ".join(
        filter(
            None,
            [
                contact.givenName(),
                contact.familyName(),
            ],
        )
    ).strip() or None
    organization = contact.organizationName() or None
    if not full_name:
        full_name = organization

    emails = [
        str(value.value())
        for value in contact.emailAddresses()
    ]
    phones = [
        str(value.value().stringValue())
        for value in contact.phoneNumbers()
    ]

    linkedin = None
    for value in contact.urlAddresses():
        url = str(value.value())
        if "linkedin.com" in url.lower():
            linkedin = url
            break

    photo_b64 = None
    if contact.imageDataAvailable():
        data = contact.imageData()
        if data is not None:
            photo_b64 = _resize_to_b64_jpeg(bytes(data))

    return {
        "external_id": contact.identifier(),
        "name": full_name,
        "organization": organization,
        "emails": emails,
        "phones": phones,
        "linkedin_url": linkedin,
        "photo_b64": photo_b64,
    }


def _resize_to_b64_jpeg(raw: bytes) -> str | None:
    """Resize a raw image to a 256x256 (square, center-cropped) JPEG and
    return the base64-encoded result. ~20-30KB per photo at quality 80.

    Returns None on decode failure (rare — Apple Contacts photos are
    almost always JPEG/PNG).
    """
    try:
        im = Image.open(io.BytesIO(raw))
        im = im.convert("RGB")
        # Center-crop to square
        w, h = im.size
        side = min(w, h)
        left = (w - side) // 2
        top = (h - side) // 2
        im = im.crop((left, top, left + side, top + side))
        # Resize
        im = im.resize(
            (PHOTO_TARGET_SIDE, PHOTO_TARGET_SIDE), Image.Resampling.LANCZOS
        )
        buf = io.BytesIO()
        im.save(buf, format="JPEG", quality=PHOTO_JPEG_QUALITY, optimize=True)
        return base64.b64encode(buf.getvalue()).decode("ascii")
    except Exception as e:
        log.warning("photo resize failed: %s", e)
        return None


def iter_contacts(batch_size: int = 50) -> Iterator[list[dict]]:
    """Yield batches of contacts. With 256x256 JPEG photos (~25KB) inline,
    50 contacts × 25KB = ~1.25MB — comfortably under Vercel's 4MB cap.
    """
    contacts = read_contacts()
    for i in range(0, len(contacts), batch_size):
        yield contacts[i : i + batch_size]
