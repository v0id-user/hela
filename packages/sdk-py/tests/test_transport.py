"""
Transport-level tests. We don't want a real gateway for these; instead
we poke `Socket` at its seams:

- `_dispatch` routing (phx_reply by ref; custom events to subscription callbacks)
- `register` / `unregister` lifecycle
- `push` timeout surfaces `hela.TimeoutError`
- error replies map to `UnauthorizedError` / `ServerError`
"""

from __future__ import annotations

import asyncio
import json

import pytest

from hela._transport import Socket
from hela.errors import ServerError, TimeoutError, UnauthorizedError


class _FakeWS:
    """
    Minimum surface Socket.push / Socket._reader touch. We feed frames
    back in via `deliver()` so tests stay deterministic.
    """

    def __init__(self) -> None:
        self.sent: list[str] = []

    async def send(self, payload: str) -> None:
        self.sent.append(payload)

    async def close(self) -> None:
        pass


# ---------------------------------------------------------------------------


@pytest.fixture
def socket() -> Socket:
    """A Socket with a fake ws and no background tasks."""
    s = Socket(url="ws://test/socket/websocket")
    s._ws = _FakeWS()  # type: ignore[assignment]
    return s


def _last_frame(s: Socket) -> list:
    assert s._ws is not None
    return json.loads(s._ws.sent[-1])  # type: ignore[attr-defined]


# --- register / unregister ------------------------------------------------


def test_register_allocates_unique_join_refs(socket: Socket):
    ref_a = socket.register("chan:a", lambda e, p: None)
    ref_b = socket.register("chan:b", lambda e, p: None)
    assert ref_a != ref_b
    assert "chan:a" in socket._subs
    assert "chan:b" in socket._subs


def test_unregister_drops_subscription(socket: Socket):
    socket.register("chan:a", lambda e, p: None)
    socket.unregister("chan:a")
    assert "chan:a" not in socket._subs


def test_unregister_unknown_is_noop(socket: Socket):
    # must not raise
    socket.unregister("chan:ghost")


# --- push + phx_reply round-trip ------------------------------------------


async def test_push_receives_ok_reply(socket: Socket):
    socket.register("chan:test", lambda e, p: None)
    task = asyncio.create_task(socket.push("chan:test", "publish", {"body": "hi"}))
    # give the send a tick so we can inspect what went out
    await asyncio.sleep(0)

    frame = _last_frame(socket)
    join_ref, ref, topic, event, payload = frame
    assert topic == "chan:test"
    assert event == "publish"
    assert payload == {"body": "hi"}

    # now deliver a matching reply
    socket._dispatch([join_ref, ref, topic, "phx_reply", {"status": "ok", "response": {"id": "x"}}])

    result = await task
    assert result == {"id": "x"}


async def test_push_unauthorized_maps_to_typed_exception(socket: Socket):
    socket.register("chan:test", lambda e, p: None)
    task = asyncio.create_task(socket.push("chan:test", "phx_join", {}))
    await asyncio.sleep(0)

    frame = _last_frame(socket)
    join_ref, ref, topic, *_ = frame
    socket._dispatch(
        [
            join_ref,
            ref,
            topic,
            "phx_reply",
            {"status": "error", "response": {"reason": "unauthorized"}},
        ]
    )

    with pytest.raises(UnauthorizedError):
        await task


async def test_push_server_error_carries_reason_and_payload(socket: Socket):
    socket.register("chan:test", lambda e, p: None)
    task = asyncio.create_task(socket.push("chan:test", "publish", {}))
    await asyncio.sleep(0)

    frame = _last_frame(socket)
    join_ref, ref, topic, *_ = frame
    socket._dispatch(
        [
            join_ref,
            ref,
            topic,
            "phx_reply",
            {"status": "error", "response": {"reason": "rate_limited", "retry_after_ms": 250}},
        ]
    )

    with pytest.raises(ServerError) as excinfo:
        await task
    assert excinfo.value.reason == "rate_limited"
    assert excinfo.value.payload["retry_after_ms"] == 250


async def test_push_timeout_raises_hela_timeout(socket: Socket):
    socket.register("chan:test", lambda e, p: None)
    with pytest.raises(TimeoutError):
        await socket.push("chan:test", "publish", {}, timeout=0.05)


# --- custom events route to subscription handler --------------------------


async def test_custom_events_go_to_on_event(socket: Socket):
    received: list[tuple[str, dict]] = []
    socket.register("chan:test", lambda e, p: received.append((e, p)))

    socket._dispatch([None, None, "chan:test", "message", {"body": "hey"}])
    assert received == [("message", {"body": "hey"})]


def test_dispatch_on_unknown_topic_is_dropped(socket: Socket):
    # no subscription for chan:ghost — must not raise
    socket._dispatch([None, None, "chan:ghost", "message", {"body": "hi"}])


# --- url encoding ---------------------------------------------------------


def test_url_with_params_adds_query_string():
    s = Socket(url="ws://host/socket/websocket", params={"vsn": "2.0.0", "token": "abc"})
    url = s._url_with_params()
    assert url.startswith("ws://host/socket/websocket?")
    assert "vsn=2.0.0" in url
    assert "token=abc" in url


def test_url_with_params_appends_to_existing_query():
    s = Socket(url="ws://host/socket/websocket?existing=1", params={"vsn": "2.0.0"})
    assert "?existing=1&vsn=2.0.0" in s._url_with_params()


def test_url_with_no_params_unchanged():
    s = Socket(url="ws://host/socket/websocket")
    assert s._url_with_params() == "ws://host/socket/websocket"
