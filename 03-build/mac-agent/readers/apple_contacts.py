"""
Apple Contacts reader.

Uses the Contacts framework via pyobjc. Requires the user to grant
"Contacts" permission to the Python interpreter (System Settings →
Privacy & Security → Contacts).

Returns a list of dicts ready for the web ingestion endpoint.
"""

from __future__ import annotations

from typing import Iterator

import Contacts  # type: ignore[import-not-found]


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

    # v1 doesn't render photos (avatars use deterministic-color initials),
    # so we deliberately don't send the base64-encoded image data — a
    # batch of 200 contacts × ~100KB each would blow past Vercel's 4MB
    # request body cap. We just record whether a photo was available so
    # the schema can carry it later.
    photo_available = bool(contact.imageDataAvailable())

    return {
        "external_id": contact.identifier(),
        "name": full_name,
        "organization": organization,
        "emails": emails,
        "phones": phones,
        "linkedin_url": linkedin,
        "photo_available": photo_available,
    }


def iter_contacts(batch_size: int = 100) -> Iterator[list[dict]]:
    """Yield batches of contacts (memory-friendly for the pusher).
    Smaller batch size keeps each request well under Vercel's 4MB cap
    even if the payload column on the server side bloats with extras.
    """
    contacts = read_contacts()
    for i in range(0, len(contacts), batch_size):
        yield contacts[i : i + batch_size]
