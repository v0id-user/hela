"""
Phoenix.Presence client-side CRDT state. Mirrors phoenix.js' Presence —
the state is the single-source-of-truth roster, updated from
`presence_state` (full) and `presence_diff` (incremental) frames.
"""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

# Strong refs for fire-and-forget async handler tasks. Without this the
# loop is free to GC a pending task before it runs.
_BG_TASKS: set[asyncio.Task[Any]] = set()


@dataclass
class PresenceEntry:
    """One roster entry. `id` is the nickname (falling back to JWT sub).

    `metas` is a list because the same user may have multiple live
    connections — each connection contributes one meta. Typical app
    code only needs the first one."""

    id: str
    metas: list[dict[str, Any]] = field(default_factory=list)


PresenceHandler = (
    Callable[[list[PresenceEntry]], Any] | Callable[[list[PresenceEntry]], Awaitable[Any]]
)


class Presence:
    """
    In-memory state + `on_sync` callback. Attached to a HelaChannel;
    users get it as `channel.presence`.
    """

    def __init__(self) -> None:
        self._state: dict[str, dict[str, Any]] = {}
        self._handlers: list[PresenceHandler] = []

    # --- mutation (called by channel) -----------------------------------

    def _set_state(self, state: dict[str, Any]) -> None:
        self._state = dict(state)
        self._fire()

    def _apply_diff(self, diff: dict[str, Any]) -> None:
        """
        Apply `presence_diff`: leaves first, then joins. `metas` within a
        user are merged by phx_ref so duplicate connections behave right.
        """
        for key, entry in (diff.get("leaves") or {}).items():
            current = self._state.get(key)
            if not current:
                continue
            leaving_refs = {m.get("phx_ref") for m in entry.get("metas", [])}
            remaining = [
                m for m in current.get("metas", []) if m.get("phx_ref") not in leaving_refs
            ]
            if remaining:
                self._state[key] = {"metas": remaining}
            else:
                self._state.pop(key, None)

        for key, entry in (diff.get("joins") or {}).items():
            existing_metas = self._state.get(key, {}).get("metas", [])
            self._state[key] = {"metas": existing_metas + list(entry.get("metas", []))}

        self._fire()

    # --- public API -----------------------------------------------------

    def list(self) -> list[PresenceEntry]:
        return [PresenceEntry(id=k, metas=v.get("metas", [])) for k, v in self._state.items()]

    def on_sync(self, handler: PresenceHandler) -> PresenceHandler:
        """
        Register a callback. Fires on every state or diff update with the
        current roster. Sync + async handlers both supported.

        Usable as a decorator::

            @channel.presence.on_sync
            async def handle(roster):
                print(len(roster), "online")
        """
        self._handlers.append(handler)
        # fire once immediately so subscribers don't wait for the next event
        self._call_handlers()
        return handler

    # --- internals ------------------------------------------------------

    def _fire(self) -> None:
        self._call_handlers()

    def _call_handlers(self) -> None:
        snapshot = self.list()
        for h in self._handlers:
            result = h(snapshot)
            if hasattr(result, "__await__"):
                # Async handler — fire-and-forget. User code is expected
                # to handle its own errors. We keep a ref while running.
                task = asyncio.ensure_future(result)
                _BG_TASKS.add(task)
                task.add_done_callback(_BG_TASKS.discard)
