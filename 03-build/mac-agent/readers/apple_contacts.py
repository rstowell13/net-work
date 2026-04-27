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

    success, error = store.enumerateContactsWithFetchRequest_error_handler_(
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
            import base64
            photo_b64 = base64.b64encode(bytes(data)).decode("ascii")

    return {
        "external_id": contact.identifier(),
        "name": full_name,
        "organization": organization,
        "emails": emails,
        "phones": phones,
        "linkedin_url": linkedin,
        "photo_b64": photo_b64,
    }


def iter_contacts(batch_size: int = 200) -> Iterator[list[dict]]:
    """Yield batches of contacts (memory-friendly for the pusher)."""
    contacts = read_contacts()
    for i in range(0, len(contacts), batch_size):
        yield contacts[i : i + batch_size]
