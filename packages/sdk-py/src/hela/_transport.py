"""
Minimal Phoenix Channel v2 protocol client. Not exposed to users —
`HelaClient` wraps it with a domain API.

Wire format, from phoenix.js source:
    outgoing:  [join_ref, ref, topic, event, payload]
    incoming:  [join_ref | null, ref | null, topic, event, payload]

`ref` is a monotonic integer the client picks per outbound frame. Replies
come back with the same `ref`; that's how we correlate pushes to responses.

`join_ref` is also client-chosen; it's the `ref` of the original phx_join
for a topic. Each channel instance has its own join_ref so the server can
tell multiple joins on the same topic apart.
"""

from __future__ import annotations

import asyncio
import builtins
import contextlib
import json
import logging
import ssl as _ssl
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

import websockets

from hela.errors import ServerError, TimeoutError, UnauthorizedError

_log = logging.getLogger("hela.transport")


@dataclass
class _PendingReply:
    future: asyncio.Future[Any]
    topic: str


@dataclass
class _Subscription:
    """Per-topic routing: pending replies + push handlers."""

    topic: str
    join_ref: str
    on_event: Callable[[str, Any], None]
    pending: dict[str, _PendingReply] = field(default_factory=dict)


class Socket:
    """
    One WebSocket, multiplexing many channels. Mirrors phoenix.js' Socket.

    Users don't touch this directly; HelaClient owns it.
    """

    def __init__(
        self,
        url: str,
        *,
        params: dict[str, str] | None = None,
        heartbeat_interval: float = 30.0,
    ):
        self._base_url = url
        self._params = params or {}
        self._heartbeat_interval = heartbeat_interval

        self._ws: websockets.ClientConnection | None = None
        self._reader_task: asyncio.Task[None] | None = None
        self._heartbeat_task: asyncio.Task[None] | None = None

        self._ref_counter = 0
        self._subs: dict[str, _Subscription] = {}
        # Heartbeats go to the phoenix system topic; we track one pending
        # reply outside any user subscription.
        self._heartbeat_pending: dict[str, asyncio.Future[Any]] = {}

    # --- lifecycle ------------------------------------------------------

    async def connect(self, *, ssl: _ssl.SSLContext | None | bool = None) -> None:
        """
        Open the WebSocket. Idempotent.
        """
        if self._ws is not None:
            return

        url = self._url_with_params()
        # websockets accepts either an SSLContext, None (default for wss),
        # or False to disable. Pass through unchanged.
        self._ws = await websockets.connect(
            url,
            ssl=ssl if url.startswith("wss://") else None,
            ping_interval=None,  # we do our own heartbeat on the phx channel
            close_timeout=2,
            max_size=8_000_000,
        )
        self._reader_task = asyncio.create_task(self._reader(), name="hela-transport-reader")
        self._heartbeat_task = asyncio.create_task(
            self._heartbeat(), name="hela-transport-heartbeat"
        )

    async def close(self) -> None:
        """Tear down the socket and all its tasks."""
        for task in (self._reader_task, self._heartbeat_task):
            if task:
                task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await task

        if self._ws is not None:
            await self._ws.close()
            self._ws = None

        for sub in self._subs.values():
            for pending in sub.pending.values():
                if not pending.future.done():
                    pending.future.set_exception(HelaError("socket closed"))
        self._subs.clear()

    # --- channel registration ------------------------------------------

    def register(
        self,
        topic: str,
        on_event: Callable[[str, Any], None],
    ) -> str:
        """
        Allocate a `join_ref` for a new topic and stash the event handler.
        Returns the join_ref the caller must use for subsequent pushes.
        """
        join_ref = self._next_ref()
        self._subs[topic] = _Subscription(topic=topic, join_ref=join_ref, on_event=on_event)
        return join_ref

    def unregister(self, topic: str) -> None:
        self._subs.pop(topic, None)

    # --- push -----------------------------------------------------------

    async def push(
        self,
        topic: str,
        event: str,
        payload: Any,
        *,
        timeout: float = 10.0,
    ) -> Any:
        """
        Send a frame and await its reply. Raises `TimeoutError` if no
        reply arrives within `timeout`.

        For phx_join specifically, the caller passes their pre-allocated
        join_ref via `register()` first; for all other events the topic's
        registered join_ref is reused.
        """
        if self._ws is None:
            raise RuntimeError("push before connect")

        sub = self._subs.get(topic)
        join_ref = sub.join_ref if sub else self._next_ref()
        ref = self._next_ref()

        loop = asyncio.get_running_loop()
        fut: asyncio.Future[Any] = loop.create_future()
        if sub is not None:
            sub.pending[ref] = _PendingReply(future=fut, topic=topic)

        frame = [join_ref, ref, topic, event, payload]
        await self._ws.send(json.dumps(frame))

        try:
            return await asyncio.wait_for(fut, timeout=timeout)
        except builtins.TimeoutError as e:
            if sub is not None:
                sub.pending.pop(ref, None)
            raise TimeoutError(f"{event} on {topic} timed out after {timeout}s") from e

    # --- internals ------------------------------------------------------

    def _next_ref(self) -> str:
        self._ref_counter += 1
        return str(self._ref_counter)

    def _url_with_params(self) -> str:
        if not self._params:
            return self._base_url
        from urllib.parse import urlencode

        sep = "&" if "?" in self._base_url else "?"
        return f"{self._base_url}{sep}{urlencode(self._params)}"

    async def _reader(self) -> None:
        assert self._ws is not None
        try:
            async for raw in self._ws:
                if isinstance(raw, bytes):
                    raw = raw.decode()
                try:
                    frame = json.loads(raw)
                except json.JSONDecodeError:
                    _log.warning("non-JSON frame dropped: %r", raw[:200])
                    continue
                self._dispatch(frame)
        except websockets.exceptions.ConnectionClosed:
            _log.debug("socket closed by server")

    def _dispatch(self, frame: list[Any]) -> None:
        """
        Frame shape: [join_ref, ref, topic, event, payload]. We route on
        topic first; `phx_reply` goes to the pending future keyed by
        ref, everything else flows to the subscription's on_event cb.
        """
        _join_ref, ref, topic, event, payload = frame

        # Heartbeat replies land on the shared "phoenix" topic.
        if topic == "phoenix" and ref is not None:
            fut = self._heartbeat_pending.pop(ref, None)
            if fut and not fut.done():
                fut.set_result(payload)
            return

        sub = self._subs.get(topic)
        if sub is None:
            # Reply for a topic we already unregistered; ignore.
            return

        if event == "phx_reply" and ref is not None:
            pending = sub.pending.pop(ref, None)
            if pending and not pending.future.done():
                status = (payload or {}).get("status")
                response = (payload or {}).get("response")
                if status == "ok":
                    pending.future.set_result(response)
                else:
                    reason = (response or {}).get("reason", "unknown")
                    if reason == "unauthorized":
                        pending.future.set_exception(UnauthorizedError(reason))
                    else:
                        pending.future.set_exception(ServerError(reason, response))
            return

        sub.on_event(event, payload)

    async def _heartbeat(self) -> None:
        """Phoenix wants a heartbeat on the `phoenix` topic every 30s."""
        try:
            while True:
                await asyncio.sleep(self._heartbeat_interval)
                if self._ws is None:
                    return

                ref = self._next_ref()
                loop = asyncio.get_running_loop()
                fut: asyncio.Future[Any] = loop.create_future()
                self._heartbeat_pending[ref] = fut
                frame = [None, ref, "phoenix", "heartbeat", {}]
                try:
                    await self._ws.send(json.dumps(frame))
                    await asyncio.wait_for(fut, timeout=10)
                except builtins.TimeoutError:
                    _log.warning("heartbeat timeout — the connection is probably dead")
                except websockets.exceptions.ConnectionClosed:
                    return
        except asyncio.CancelledError:
            raise


# re-import at the bottom so mypy is happy with the error path
from hela.errors import HelaError  # noqa: E402
