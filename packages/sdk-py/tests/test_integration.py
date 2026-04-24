"""
Live-gateway integration. Mirrors `scripts/e2e.py` but exercises the
SDK surface (`hela.connect`, `chat.join`, `chat.publish`, `Presence`)
instead of hand-rolled Phoenix frames. If this passes, a customer
using the published wheel can reproduce the same flow.

Skipped unless `HELA_LIVE=1`. Defaults point at the deployed Railway
stack; override with `HELA_CONTROL` and `HELA_GATEWAY` env vars.

Run locally::

    HELA_LIVE=1 uv run pytest tests/test_integration.py -v
"""

from __future__ import annotations

import asyncio
import os
import time

import httpx
import pytest

from hela import HelaClient, Message, RateLimitedError, connect
from hela.rest import Hela

pytestmark = pytest.mark.skipif(
    os.environ.get("HELA_LIVE") != "1",
    reason="live integration — set HELA_LIVE=1 to run",
)

CT = os.environ.get("HELA_CONTROL", "https://control-production-059e.up.railway.app")
GW = os.environ.get("HELA_GATEWAY", "https://gateway-production-bfdf.up.railway.app")


# --- fixtures: per-session throwaway account + project + api key ---------


@pytest.fixture(scope="session")
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture(scope="session")
async def project_creds() -> dict:
    """
    Signs up a throwaway account, creates a project, issues an API key.
    Returns everything the other tests need. Session-scoped so we only
    pay the setup tax once per `pytest` run.
    """
    email = f"sdk-py-{int(time.time() * 1000)}@gmail.com"
    async with httpx.AsyncClient(timeout=20, follow_redirects=False) as c:
        (await c.post(f"{CT}/auth/signup", json={"email": email})).raise_for_status()

        r = await c.post(
            f"{CT}/api/projects",
            json={"name": "sdk-py-smoke", "region": "iad", "tier": "starter"},
        )
        r.raise_for_status()
        project = r.json()["project"]

        r = await c.post(
            f"{CT}/api/projects/{project['id']}/keys",
            json={"label": "sdk-py-smoke"},
        )
        r.raise_for_status()
        api_key = r.json()["wire"]

    return {"project": project, "api_key": api_key, "gateway": GW}


@pytest.fixture
async def end_user_token(project_creds: dict) -> str:
    """Mint a short-lived end-user JWT via the REST SDK."""
    async with Hela(base_url=project_creds["gateway"], api_key=project_creds["api_key"]) as h:
        # Control -> gateway project sync is best-effort; retry briefly.
        last: Exception | None = None
        for _ in range(5):
            try:
                resp = await h.mint_token(
                    sub="end-user-alice",
                    chans=[
                        ["read", "chat:*"],
                        ["write", "chat:*"],
                        ["read", "presence:*"],
                        ["write", "presence:*"],
                    ],
                    ttl_seconds=600,
                )
                return resp.token
            except Exception as e:
                last = e
                await asyncio.sleep(1)
        raise AssertionError(f"mint_token never succeeded: {last!r}")


# --- 1. connect + join ----------------------------------------------------


async def test_connect_and_join(end_user_token: str):
    endpoint = GW
    async with await connect(region="iad", token=end_user_token, endpoint=endpoint) as client:
        assert isinstance(client, HelaClient)
        chat = client.channel("chat:lobby")
        reply = await chat.join(nickname="alice")
        assert reply.region == "iad"
        assert reply.node.startswith("gw@")
        await chat.leave()


# --- 2. publish + self-broadcast + typed message --------------------------


async def test_publish_and_receive(end_user_token: str):
    received: list[Message] = []

    async with await connect(region="iad", token=end_user_token, endpoint=GW) as client:
        chat = client.channel("chat:lobby")
        await chat.join(nickname="alice")

        @chat.on_message
        def capture(msg: Message) -> None:
            received.append(msg)

        pub = await chat.publish("hello from sdk-py", author="alice")

        deadline = time.monotonic() + 3
        while not received and time.monotonic() < deadline:
            await asyncio.sleep(0.05)

        assert received, "never received self-broadcast"
        assert received[-1].id == pub.id
        assert received[-1].body == "hello from sdk-py"
        # `inserted_at` is an AwareDatetime — Pydantic parsed the wire ISO string
        assert received[-1].inserted_at.tzinfo is not None


# --- 3. history pagination ------------------------------------------------


async def test_history_returns_recent(end_user_token: str):
    async with await connect(region="iad", token=end_user_token, endpoint=GW) as client:
        chat = client.channel("chat:history-test")
        await chat.join(nickname="alice")

        for i in range(5):
            await chat.publish(f"hist-{i}", author="alice")
            await asyncio.sleep(0.08)

        page = await chat.history(limit=3)
        assert page.source.value in ("cache", "mixed", "db")
        assert len(page.messages) == 3
        # last message's body should be one of ours
        bodies = {m.body for m in page.messages}
        assert any(b.startswith("hist-") for b in bodies)


# --- 4. presence CRDT across two clients ---------------------------------


async def test_presence_fanout(project_creds: dict, end_user_token: str):
    # Need a second token for bob
    async with Hela(base_url=GW, api_key=project_creds["api_key"]) as h:
        bob_token = (
            await h.mint_token(
                sub="end-user-bob",
                chans=[["read", "presence:*"], ["write", "presence:*"]],
                ttl_seconds=600,
            )
        ).token

    alice_client = await connect(region="iad", token=end_user_token, endpoint=GW)
    bob_client = await connect(region="iad", token=bob_token, endpoint=GW)

    try:
        alice_roster = alice_client.channel("presence:office")
        bob_roster = bob_client.channel("presence:office")

        await alice_roster.join(nickname="alice")
        await bob_roster.join(nickname="bob")

        deadline = time.monotonic() + 3
        while time.monotonic() < deadline:
            if {e.id for e in alice_roster.presence.list()} >= {"alice", "bob"}:
                break
            await asyncio.sleep(0.1)

        roster_ids = {e.id for e in alice_roster.presence.list()}
        assert {"alice", "bob"} <= roster_ids, f"alice's roster: {roster_ids}"
    finally:
        await alice_client.close()
        await bob_client.close()


# --- 5. rate-limit error is typed ----------------------------------------


async def test_rate_limited_raises_typed(project_creds: dict):
    """
    Starter tier caps publishes at 15/sec. Burst past it from the REST
    SDK and confirm we get `RateLimitedError` with a retry hint, not a
    raw HTTP exception.
    """
    async with Hela(base_url=GW, api_key=project_creds["api_key"]) as h:
        hit_limit = False
        retry_ms = 0

        # fire 60 in a single batch; some will 200, at least one should 429
        async def _one():
            nonlocal hit_limit, retry_ms
            try:
                await h.publish("rl-test", "burst", author="bot")
            except RateLimitedError as e:
                hit_limit = True
                retry_ms = e.retry_after_ms

        await asyncio.gather(*(_one() for _ in range(60)))

        assert hit_limit, "rate limiter never tripped in a 60-req burst"
        assert retry_ms >= 0
