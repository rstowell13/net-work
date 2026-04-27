"""
HTTPS pusher. Sends batches of records to the web app's ingest endpoints
with bearer-token auth, retries on transient failures.
"""

from __future__ import annotations

import logging
import time

import requests

log = logging.getLogger(__name__)


class Pusher:
    def __init__(self, base_url: str, agent_token: str):
        self.base_url = base_url.rstrip("/")
        self.token = agent_token
        self.session = requests.Session()
        self.session.headers.update(
            {
                "Authorization": f"Bearer {agent_token}",
                "Content-Type": "application/json",
                "User-Agent": "net-work-mac-agent/1.0",
            }
        )

    def push(self, kind: str, batch: list[dict]) -> dict:
        """
        kind ∈ {"contacts", "messages", "calls"}
        Returns the server's response JSON (counts).
        """
        url = f"{self.base_url}/api/ingest/{kind}"
        for attempt in range(5):
            try:
                resp = self.session.post(url, json={"batch": batch}, timeout=60)
                if resp.status_code == 200:
                    return resp.json()
                if 500 <= resp.status_code < 600:
                    raise requests.HTTPError(f"{resp.status_code}: {resp.text[:200]}")
                # 4xx — fail fast
                resp.raise_for_status()
            except (requests.RequestException, requests.HTTPError) as e:
                wait = 2**attempt
                log.warning(
                    "push attempt %d/%d for %s failed: %s — retrying in %ss",
                    attempt + 1,
                    5,
                    kind,
                    e,
                    wait,
                )
                time.sleep(wait)
        raise RuntimeError(f"Failed to push {kind} after 5 attempts")
