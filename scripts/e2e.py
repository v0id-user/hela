#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.13"
# dependencies = [
#     "httpx>=0.27",
#     "websockets>=13",
# ]
# ///
"""
Full end-to-end test against the deployed hela stack.

Exercises the exact flow a customer goes through:

  1. Account signup via control's REST API
  2. Session cookie round-trip (logout + login)
  3. Project creation (fires Polar customer create)
  4. API key issuance (the secret shown once)
  5. /v1/tokens — server mints an HS256 JWT for an end-user
  6. Phoenix Channel WebSocket — join, publish, receive self-broadcast
  7. Presence CRDT — two clients on same channel, roster merges
  8. Rate limiter — Starter tier's 15 msg/s cap enforced

Uses Phoenix's wire protocol v2 directly:
    [join_ref, ref, topic, event, payload]
over wss://gateway/socket/websocket?token=…&vsn=2.0.0

Run:
    uv run scripts/e2e.py
or
    ./scripts/e2e.py
"""
from __future__ import annotations

import asyncio
import json
import os
import ssl
import sys
import time
from dataclasses import dataclass, field
from typing import Any

import httpx
import websockets

GW = os.environ.get("HELA_GATEWAY", "https://gateway-production-bfdf.up.railway.app")
CT = os.environ.get("HELA_CONTROL", "https://control-production-059e.up.railway.app")

WS = GW.replace("https://", "wss://").replace("http://", "ws://")


def _ok(step: str, data: Any = None) -> None:
    print(f"  \N{CHECK MARK} {step}")
    if data is not None:
        print("    ", json.dumps(data, default=str)[:200])


@dataclass
class PhxChannel:
    """Minimal Phoenix.Channel v2 client, async. One channel per instance."""

    ws: websockets.ClientConnection
    topic: str
    join_ref: str = "1"
    _ref_counter: int = 0
    _pending: dict[str, asyncio.Future[Any]] = field(default_factory=dict)
    _messages: list[dict[str, Any]] = field(default_factory=list)
    _presence_state: dict[str, Any] = field(default_factory=dict)

    def _ref(self) -> str:
        self._ref_counter += 1
        return str(self._ref_counter)

    async def push(self, event: str, payload: Any, timeout: float = 10.0) -> Any:
        ref = self._ref()
        fut: asyncio.Future[Any] = asyncio.get_running_loop().create_future()
        self._pending[ref] = fut
        frame = [self.join_ref, ref, self.topic, event, payload]
        await self.ws.send(json.dumps(frame))
        try:
            return await asyncio.wait_for(fut, timeout=timeout)
        finally:
            self._pending.pop(ref, None)

    def _on_frame(self, frame: list[Any]) -> None:
        _join_ref, ref, topic, event, payload = frame
        if topic != self.topic:
            return
        if event == "phx_reply" and ref in self._pending:
            fut = self._pending[ref]
            if not fut.done():
                status = payload.get("status")
                body = payload.get("response")
                if status == "ok":
                    fut.set_result(body)
                else:
                    fut.set_exception(RuntimeError(f"{status}: {body}"))
        elif event == "message":
            self._messages.append(payload)
        elif event == "presence_state":
            self._presence_state = payload
        elif event == "presence_diff":
            for gone in (payload.get("leaves") or {}):
                self._presence_state.pop(gone, None)
            for joined, meta in (payload.get("joins") or {}).items():
                self._presence_state[joined] = meta

    @property
    def messages(self) -> list[dict[str, Any]]:
        return self._messages

    @property
    def roster(self) -> list[str]:
        return sorted(self._presence_state.keys())


class HelaWS:
    """
    One WebSocket per client, multiplexing multiple channels. Models
    phoenix.js' Socket: one connection, `.channel(topic)` creates a
    PhxChannel that shares the underlying transport.
    """

    def __init__(self, ws: websockets.ClientConnection):
        self.ws = ws
        self._channels: dict[str, PhxChannel] = {}
        self._reader_task: asyncio.Task[None] | None = None

    @classmethod
    async def connect(cls, token: str) -> "HelaWS":
        ssl_ctx = ssl.create_default_context()
        ws = await websockets.connect(
            f"{WS}/socket/websocket?token={token}&vsn=2.0.0",
            ssl=ssl_ctx,
            ping_interval=30,
            close_timeout=2,
        )
        self = cls(ws)
        self._reader_task = asyncio.create_task(self._reader())
        return self

    async def _reader(self) -> None:
        async for raw in self.ws:
            if isinstance(raw, bytes):
                raw = raw.decode()
            frame = json.loads(raw)
            topic = frame[2]
            ch = self._channels.get(topic)
            if ch:
                ch._on_frame(frame)

    def channel(self, topic: str) -> PhxChannel:
        ch = PhxChannel(self.ws, topic)
        self._channels[topic] = ch
        return ch

    async def join(self, topic: str, params: Any | None = None) -> tuple[PhxChannel, Any]:
        ch = self.channel(topic)
        reply = await ch.push("phx_join", params or {})
        return ch, reply

    async def close(self) -> None:
        if self._reader_task:
            self._reader_task.cancel()
        await self.ws.close()


async def main() -> None:
    start = time.time()
    email = f"py-e2e-{int(time.time() * 1000)}@gmail.com"

    client = httpx.AsyncClient(timeout=20, follow_redirects=False)

    # --- 1. signup --------------------------------------------------------
    print("\n1. SIGNUP")
    r = await client.post(f"{CT}/auth/signup", json={"email": email})
    r.raise_for_status()
    account = r.json()["account"]
    _ok("account created", {"id": account["id"], "email": account["email"]})

    # --- 2. logout + login ------------------------------------------------
    print("\n2. LOGOUT + LOGIN")
    (await client.post(f"{CT}/auth/logout")).raise_for_status()
    _ok("logout")
    client.cookies.clear()
    r = await client.post(f"{CT}/auth/login", json={"email": email})
    r.raise_for_status()
    assert r.json()["account"]["id"] == account["id"], "logged in as different account"
    _ok("logged back in", account["id"])

    # --- 3. create project ------------------------------------------------
    print("\n3. CREATE PROJECT")
    r = await client.post(
        f"{CT}/api/projects",
        json={"name": "py-smoke", "region": "iad", "tier": "starter"},
    )
    r.raise_for_status()
    project = r.json()["project"]
    _ok("project", project)

    # --- 4. api key -------------------------------------------------------
    print("\n4. API KEY")
    r = await client.post(
        f"{CT}/api/projects/{project['id']}/keys",
        json={"label": "py-smoke"},
    )
    r.raise_for_status()
    api_key = r.json()["wire"]
    _ok("api key issued", {"prefix": r.json()["key"]["prefix"]})

    # --- 5. /v1/tokens mints the end-user JWT -----------------------------
    print("\n5. MINT END-USER JWT (via /v1/tokens)")
    # Control -> gateway sync is best-effort; give it up to 5s to land.
    token = None
    for _ in range(5):
        r = await client.post(
            f"{GW}/v1/tokens",
            headers={"authorization": f"Bearer {api_key}"},
            json={
                "sub": "end-user-alice",
                "chans": [
                    ["read", "chat:*"],
                    ["write", "chat:*"],
                    ["read", "presence:*"],
                    ["write", "presence:*"],
                ],
                "ttl_seconds": 600,
            },
        )
        if r.status_code == 200:
            token = r.json()["token"]
            break
        await asyncio.sleep(1)
    assert token, f"/v1/tokens never succeeded: last status {r.status_code}, body {r.text[:200]}"
    _ok("JWT minted", {"expires_in": r.json()["expires_in"]})

    # --- 6. WS connect + join two channels --------------------------------
    print("\n6. WEBSOCKET (Phoenix v2 wire protocol)")
    alice = await HelaWS.connect(token)

    chat_topic = f"chan:{project['id']}:chat:lobby"
    pres_topic = f"chan:{project['id']}:presence:office"

    chat, chat_reply = await alice.join(chat_topic, {"nickname": "alice"})
    _ok("chat.join()", {"source": chat_reply["source"], "region": chat_reply["region"]})

    roster, _ = await alice.join(pres_topic, {"nickname": "alice"})
    _ok("roster.join()")

    # --- 7. publish + receive self-broadcast ------------------------------
    print("\n7. PUBLISH + RECEIVE")
    before = len(chat.messages)
    pub = await chat.push("publish", {"body": "hello from python", "author": "alice"})
    _ok("publish ack", pub)

    # wait for the self-broadcast to arrive
    deadline = time.time() + 3
    while len(chat.messages) == before and time.time() < deadline:
        await asyncio.sleep(0.05)
    assert len(chat.messages) > before, "never received self-broadcast"
    msg = chat.messages[-1]
    assert msg["id"] == pub["id"], f"id mismatch: {msg['id']} vs {pub['id']}"
    _ok("round-trip confirmed", {"id": msg["id"], "author": msg["author"], "body": msg["body"]})

    # --- 8. history ------------------------------------------------------
    print("\n8. HISTORY (first page)")
    for i in range(5):
        await chat.push("publish", {"body": f"hist-{i}", "author": "alice"})
        await asyncio.sleep(0.1)
    h1 = await chat.push("history", {"limit": 3})
    _ok("history page 1", {"source": h1["source"], "count": len(h1["messages"])})

    # --- 9. second client — presence CRDT fan-out -------------------------
    print("\n9. SECOND CLIENT (presence fan-out)")
    bob_token_r = await client.post(
        f"{GW}/v1/tokens",
        headers={"authorization": f"Bearer {api_key}"},
        json={
            "sub": "end-user-bob",
            "chans": [["read", "presence:*"], ["write", "presence:*"]],
            "ttl_seconds": 600,
        },
    )
    bob_token_r.raise_for_status()
    bob = await HelaWS.connect(bob_token_r.json()["token"])
    bob_roster, _ = await bob.join(pres_topic, {"nickname": "bob"})
    _ok("bob joined roster")

    # give the CRDT up to 3s to propagate
    deadline = time.time() + 3
    while "bob" not in roster.roster and time.time() < deadline:
        await asyncio.sleep(0.1)
    assert "bob" in roster.roster, f"alice doesn't see bob — roster: {roster.roster}"
    _ok("alice sees bob", {"roster": roster.roster})

    # --- 10. rate limiter -------------------------------------------------
    print("\n10. RATE LIMIT (Starter = 15/s)")

    # The rate limit is a fixed-window bucket keyed by the current unix
    # second. To reliably trigger the cap we (a) prewarm a connection
    # pool so TLS isn't in the hot path, (b) fire 60 in one batch so the
    # burst compresses into <1s even if a few requests straddle a
    # second boundary.
    rl_client = httpx.AsyncClient(
        timeout=10,
        limits=httpx.Limits(max_connections=200, max_keepalive_connections=100),
    )
    # Warm one connection to the gateway so the real burst hits an
    # already-negotiated TLS session.
    (await rl_client.get(f"{GW}/health")).raise_for_status()

    async def fire() -> int:
        r = await rl_client.post(
            f"{GW}/v1/channels/rl-test/publish",
            headers={"authorization": f"Bearer {api_key}"},
            json={"body": "burst", "author": "bot"},
        )
        return r.status_code

    t0 = time.monotonic()
    results = await asyncio.gather(*(fire() for _ in range(60)))
    window_s = time.monotonic() - t0
    ok_count = sum(1 for s in results if s == 200)
    limited = sum(1 for s in results if s == 429)
    await rl_client.aclose()
    assert limited > 0, (
        f"rate limiter never fired after {window_s:.2f}s: "
        f"{ok_count} ok, others {sorted(set(results) - {200, 429})}"
    )
    _ok(
        "rate limit enforced",
        {
            "accepted": ok_count,
            "limited": limited,
            "cap_per_sec": 15,
            "window_s": round(window_s, 2),
        },
    )

    # --- cleanup ----------------------------------------------------------
    await alice.close()
    await bob.close()
    await client.aclose()

    elapsed = time.time() - start
    print(f"\n=== ALL 10 PASSED in {elapsed:.1f}s ===")
    print(f"account: {account['id']}")
    print(f"project: {project['id']} ({project['region']}/{project['tier']})")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except AssertionError as e:
        print(f"\n\N{CROSS MARK} FAILED: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"\n\N{CROSS MARK} ERROR: {type(e).__name__}: {e}", file=sys.stderr)
        sys.exit(2)
