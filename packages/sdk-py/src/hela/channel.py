"""
A joined channel on the hela gateway. Exposes publish, history, presence,
and an on_message subscription. One HelaChannel per (project, channel);
the underlying socket is shared.
"""

from __future__ import annotations

import asyncio
import contextlib
from collections.abc import Awaitable, Callable
from typing import TYPE_CHECKING, Any

from hela._generated.wire import (
    HistoryReply1 as HistoryReply,
)
from hela._generated.wire import (
    HistoryRequest1 as HistoryRequest,
)
from hela._generated.wire import (
    JoinReply1 as JoinReply,
)
from hela._generated.wire import (
    JoinRequest1 as JoinRequest,
)
from hela._generated.wire import (
    Message1 as Message,
)
from hela._generated.wire import (
    PublishReply1 as PublishReply,
)
from hela._generated.wire import (
    PublishRequest1 as PublishRequest,
)
from hela.errors import RateLimitedError, ServerError
from hela.presence import Presence

if TYPE_CHECKING:
    from hela._transport import Socket


MessageHandler = Callable[[Message], Any] | Callable[[Message], Awaitable[Any]]

# Anchor for fire-and-forget async handler tasks. Without this the event
# loop is allowed to garbage-collect a pending task mid-flight, and the
# user's callback silently never runs. We drop the ref as soon as the
# task finishes.
_BG_TASKS: set[asyncio.Task[Any]] = set()


class HelaChannel:
    """
    Channel handle. Create via `HelaClient.channel(...)` rather than
    instantiating directly.
    """

    def __init__(
        self,
        *,
        socket: Socket,
        topic: str,
        channel_name: str,
        project_id: str,
    ):
        self._socket = socket
        self._topic = topic
        self._name = channel_name
        self._project_id = project_id
        self._handlers: list[MessageHandler] = []
        self.presence = Presence()
        self._joined = False
        self._join_reply: JoinReply | None = None

    # --- public API -----------------------------------------------------

    @property
    def name(self) -> str:
        return self._name

    @property
    def project_id(self) -> str:
        return self._project_id

    async def join(self, nickname: str | None = None, *, timeout: float = 10.0) -> JoinReply:
        """
        Send `phx_join` + await the reply. Seeds the 50 most recent
        messages and the region/node metadata. Call exactly once per
        channel instance.
        """
        # Register the subscription BEFORE sending the join so the join's
        # reply lands on our pending-futures map.
        self._socket.register(self._topic, self._on_event)

        payload = JoinRequest(nickname=nickname).model_dump(exclude_none=True)
        raw = await self._socket.push(self._topic, "phx_join", payload, timeout=timeout)
        reply = JoinReply.model_validate(raw)
        self._joined = True
        self._join_reply = reply
        return reply

    async def leave(self, *, timeout: float = 5.0) -> None:
        """Send `phx_leave` + drop the subscription."""
        if self._joined:
            # Tolerant: the socket may already be closing and we don't want
            # `leave()` to hide that fact behind an exception.
            with contextlib.suppress(Exception):
                await self._socket.push(self._topic, "phx_leave", {}, timeout=timeout)
        self._socket.unregister(self._topic)
        self._joined = False

    async def publish(
        self,
        body: str,
        *,
        author: str | None = None,
        reply_to_id: str | None = None,
        timeout: float = 10.0,
    ) -> PublishReply:
        """
        Publish one message. Raises `RateLimitedError(retry_after_ms)`
        if the project's per-second cap is hit, or `ServerError` for
        anything else the server rejects.
        """
        payload = PublishRequest(
            body=body,
            author=author,
            reply_to_id=reply_to_id,
        ).model_dump(exclude_none=True)

        try:
            raw = await self._socket.push(self._topic, "publish", payload, timeout=timeout)
        except ServerError as e:
            if e.reason == "rate_limited":
                raise RateLimitedError(
                    retry_after_ms=e.payload.get("retry_after_ms", 0),
                ) from None
            raise

        return PublishReply.model_validate(raw)

    async def history(
        self,
        *,
        before: str | None = None,
        limit: int = 50,
        timeout: float = 10.0,
    ) -> HistoryReply:
        """
        Cursor-paginated history. `before` is a message id from the
        previous page. First page: omit `before`.
        """
        payload = HistoryRequest(before=before, limit=limit).model_dump(exclude_none=True)
        raw = await self._socket.push(self._topic, "history", payload, timeout=timeout)
        return HistoryReply.model_validate(raw)

    def on_message(self, handler: MessageHandler) -> MessageHandler:
        """
        Register a callback for incoming `message` events. Usable as a
        decorator::

            @chat.on_message
            async def handle(msg):
                print(msg.body)
        """
        self._handlers.append(handler)
        return handler

    # --- internal: socket routes events here ---------------------------

    def _on_event(self, event: str, payload: Any) -> None:
        if event == "message":
            try:
                msg = Message.model_validate(payload)
            except Exception:
                # malformed payload — log but don't crash the reader
                return
            for h in self._handlers:
                result = h(msg)
                if hasattr(result, "__await__"):
                    task = asyncio.ensure_future(result)
                    _BG_TASKS.add(task)
                    task.add_done_callback(_BG_TASKS.discard)

        elif event == "presence_state":
            self.presence._set_state(payload or {})

        elif event == "presence_diff":
            self.presence._apply_diff(payload or {})
