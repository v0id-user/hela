"""
Round-trip tests for the generated Pydantic models. The point is not to
re-test Pydantic — it's to catch schema drift: if `packages/schemas/`
changes in a way that breaks a real wire payload, this file screams.

Payloads here match what `Hela.Chat.Message.to_wire/1` actually emits
on the gateway, byte-for-byte.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from hela import (
    HistoryReply,
    JoinReply,
    Message,
    PresenceDiff,
    PresenceState,
    PublishReply,
    PublishRequest,
)

# A real-ish UUIDv7; first 48 bits are a unix-ms, last chunk random.
UUIDV7 = "01901234-abcd-7def-8123-456789abcdef"
UUIDV7_OLDER = "01801234-abcd-7def-8123-456789abcdef"


# --- Message ---------------------------------------------------------------


def test_message_roundtrip():
    payload = {
        "id": UUIDV7,
        "channel": "chat:lobby",
        "author": "alice",
        "body": "hello",
        "node": "gw@iad-1",
        "inserted_at": "2026-04-24T01:00:00Z",
    }
    m = Message.model_validate(payload)
    assert m.id == UUIDV7
    assert m.channel == "chat:lobby"
    assert m.author == "alice"
    assert m.body == "hello"
    assert m.reply_to_id is None
    # re-serializing preserves the shape; datetime becomes an ISO string
    out = m.model_dump(mode="json", exclude_none=True)
    assert out["id"] == UUIDV7
    assert out["author"] == "alice"
    assert "reply_to_id" not in out


def test_message_reply_to_id():
    payload = {
        "id": UUIDV7,
        "channel": "chat:lobby",
        "author": "alice",
        "body": "yep",
        "reply_to_id": UUIDV7_OLDER,
        "node": "gw@iad-1",
        "inserted_at": "2026-04-24T01:00:00Z",
    }
    m = Message.model_validate(payload)
    assert m.reply_to_id == UUIDV7_OLDER


def test_message_rejects_bad_uuid():
    with pytest.raises(ValidationError):
        Message.model_validate(
            {
                "id": "not-a-uuid",
                "channel": "chat:lobby",
                "author": "alice",
                "body": "x",
                "node": "gw@iad-1",
                "inserted_at": "2026-04-24T01:00:00Z",
            }
        )


def test_message_rejects_extra_fields():
    """Schemas have additionalProperties: false — enforce it."""
    with pytest.raises(ValidationError):
        Message.model_validate(
            {
                "id": UUIDV7,
                "channel": "chat:lobby",
                "author": "alice",
                "body": "x",
                "node": "gw@iad-1",
                "inserted_at": "2026-04-24T01:00:00Z",
                "sneaky": "extra",
            }
        )


def test_message_requires_core_fields():
    with pytest.raises(ValidationError):
        Message.model_validate({"id": UUIDV7, "body": "x"})


# --- PublishRequest --------------------------------------------------------


def test_publish_request_body_length_cap():
    # Exactly 4000 chars: should validate.
    ok = PublishRequest.model_validate({"body": "a" * 4000})
    assert len(ok.body) == 4000
    # Over cap: should reject.
    with pytest.raises(ValidationError):
        PublishRequest.model_validate({"body": "a" * 4001})


def test_publish_request_optional_fields_omit_none():
    req = PublishRequest(body="hello")
    out = req.model_dump(exclude_none=True)
    assert out == {"body": "hello"}


# --- PublishReply ----------------------------------------------------------


def test_publish_reply_quota_enum():
    reply = PublishReply.model_validate({"id": UUIDV7, "quota": "ok"})
    assert reply.quota.value == "ok"

    reply = PublishReply.model_validate({"id": UUIDV7, "quota": "over"})
    assert reply.quota.value == "over"

    with pytest.raises(ValidationError):
        PublishReply.model_validate({"id": UUIDV7, "quota": "bogus"})


# --- HistoryReply ---------------------------------------------------------


def test_history_reply_sources():
    for src in ("cache", "mixed", "db"):
        hr = HistoryReply.model_validate({"source": src, "messages": []})
        assert hr.source.value == src
        assert hr.messages == []


def test_history_reply_with_messages():
    hr = HistoryReply.model_validate(
        {
            "source": "cache",
            "messages": [
                {
                    "id": UUIDV7,
                    "channel": "chat:lobby",
                    "author": "alice",
                    "body": "hello",
                    "node": "gw@iad-1",
                    "inserted_at": "2026-04-24T01:00:00Z",
                }
            ],
        }
    )
    assert len(hr.messages) == 1
    assert hr.messages[0].author == "alice"


# --- JoinReply ------------------------------------------------------------


def test_join_reply_full_shape():
    jr = JoinReply.model_validate(
        {
            "messages": [],
            "source": "cache",
            "region": "iad",
            "node": "gw@iad-1",
        }
    )
    assert jr.region == "iad"
    assert jr.node == "gw@iad-1"


# --- Presence -------------------------------------------------------------


def test_presence_state_maps_nick_to_metas():
    ps = PresenceState.model_validate(
        {
            "alice": {"metas": [{"online_at": 1_700_000_000, "node": "gw@iad-1", "region": "iad"}]},
            "bob": {"metas": [{"online_at": 1_700_000_100, "node": "gw@iad-1"}]},
        }
    )
    assert set(ps.root.keys()) == {"alice", "bob"}
    assert ps.root["alice"].metas[0].region == "iad"


def test_presence_diff_joins_and_leaves():
    pd = PresenceDiff.model_validate(
        {
            "joins": {"bob": {"metas": [{"online_at": 1, "node": "gw@iad-1"}]}},
            "leaves": {"alice": {"metas": [{"online_at": 1, "node": "gw@iad-1"}]}},
        }
    )
    assert "bob" in pd.joins
    assert "alice" in pd.leaves


def test_presence_meta_allows_extra_fields():
    """Metas have additionalProperties: true — custom payload lives here."""
    ps = PresenceState.model_validate(
        {
            "alice": {
                "metas": [
                    {
                        "online_at": 1,
                        "node": "gw@iad-1",
                        "avatar_url": "https://x/y.png",
                    }
                ]
            }
        }
    )
    entry = ps.root["alice"]
    # model_extra carries the unknown fields.
    assert entry.metas[0].model_extra.get("avatar_url") == "https://x/y.png"
