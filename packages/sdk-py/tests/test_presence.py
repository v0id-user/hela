"""
CRDT state tests for `hela.Presence`. Mirrors phoenix.js' Presence:
the state is authoritative, diffs are applied leaves-first-then-joins,
and `metas` merge by `phx_ref` so multi-tab users behave right.
"""

from __future__ import annotations

import asyncio

from hela import Presence, PresenceEntry


def _state(**nicks: list[dict]) -> dict:
    """Shorthand for building a presence_state payload."""
    return {nick: {"metas": metas} for nick, metas in nicks.items()}


def test_initial_state_empty():
    p = Presence()
    assert p.list() == []


def test_set_state_populates_roster():
    p = Presence()
    p._set_state(
        _state(
            alice=[{"online_at": 1, "node": "n1", "phx_ref": "r1"}],
            bob=[{"online_at": 2, "node": "n1", "phx_ref": "r2"}],
        )
    )

    roster = {e.id: e for e in p.list()}
    assert set(roster) == {"alice", "bob"}
    assert roster["alice"].metas[0]["phx_ref"] == "r1"


def test_diff_join_adds_entry():
    p = Presence()
    p._set_state(_state(alice=[{"online_at": 1, "node": "n1", "phx_ref": "r1"}]))

    p._apply_diff({"joins": _state(bob=[{"online_at": 2, "node": "n1", "phx_ref": "r2"}])})

    roster = {e.id: e for e in p.list()}
    assert set(roster) == {"alice", "bob"}


def test_diff_leave_removes_entry():
    p = Presence()
    p._set_state(
        _state(
            alice=[{"online_at": 1, "node": "n1", "phx_ref": "r1"}],
            bob=[{"online_at": 2, "node": "n1", "phx_ref": "r2"}],
        )
    )

    p._apply_diff({"leaves": _state(alice=[{"online_at": 1, "node": "n1", "phx_ref": "r1"}])})

    roster = {e.id: e for e in p.list()}
    assert set(roster) == {"bob"}


def test_multi_connection_user_keeps_remaining_metas():
    """
    Alice has two tabs open (two metas). One tab disconnects — alice
    stays online because the other meta still exists.
    """
    p = Presence()
    p._set_state(
        _state(
            alice=[
                {"online_at": 1, "node": "n1", "phx_ref": "tab-A"},
                {"online_at": 2, "node": "n1", "phx_ref": "tab-B"},
            ]
        )
    )

    p._apply_diff({"leaves": _state(alice=[{"online_at": 1, "node": "n1", "phx_ref": "tab-A"}])})

    roster = {e.id: e for e in p.list()}
    assert set(roster) == {"alice"}
    assert len(roster["alice"].metas) == 1
    assert roster["alice"].metas[0]["phx_ref"] == "tab-B"


def test_diff_applies_leaves_before_joins():
    """
    When the same frame contains both a leave and a re-join for a key,
    the join should win. This is the classic reconnect-with-flicker
    scenario in phoenix.js' Presence tests.
    """
    p = Presence()
    p._set_state(_state(alice=[{"online_at": 1, "node": "n1", "phx_ref": "old"}]))

    p._apply_diff(
        {
            "leaves": _state(alice=[{"online_at": 1, "node": "n1", "phx_ref": "old"}]),
            "joins": _state(alice=[{"online_at": 2, "node": "n1", "phx_ref": "new"}]),
        }
    )

    roster = {e.id: e for e in p.list()}
    assert set(roster) == {"alice"}
    assert len(roster["alice"].metas) == 1
    assert roster["alice"].metas[0]["phx_ref"] == "new"


def test_leave_on_unknown_key_is_noop():
    p = Presence()
    p._apply_diff({"leaves": _state(ghost=[{"online_at": 1, "node": "n1", "phx_ref": "r1"}])})
    assert p.list() == []


def test_on_sync_fires_on_register_and_updates():
    """
    `on_sync` fires once immediately at register time (so subscribers
    don't wait for the next event), then on every state + diff.
    """
    p = Presence()
    calls: list[list[str]] = []

    @p.on_sync
    def capture(entries: list[PresenceEntry]) -> None:
        calls.append(sorted(e.id for e in entries))

    # one fire from register
    assert calls == [[]]

    p._set_state(_state(alice=[{"online_at": 1, "node": "n1", "phx_ref": "r1"}]))
    p._apply_diff({"joins": _state(bob=[{"online_at": 2, "node": "n1", "phx_ref": "r2"}])})

    assert calls == [[], ["alice"], ["alice", "bob"]]


def test_on_sync_async_handler(event_loop=None):
    """Async on_sync handlers are dispatched as fire-and-forget tasks."""

    async def runner() -> list[list[str]]:
        p = Presence()
        calls: list[list[str]] = []

        @p.on_sync
        async def capture(entries: list[PresenceEntry]) -> None:
            calls.append(sorted(e.id for e in entries))

        p._set_state(_state(alice=[{"online_at": 1, "node": "n1", "phx_ref": "r1"}]))
        # Let queued tasks run.
        await asyncio.sleep(0)
        await asyncio.sleep(0)
        return calls

    calls = asyncio.run(runner())
    assert [] in calls
    assert ["alice"] in calls
