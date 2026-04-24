# Auto-generated from packages/schemas/wire/. Do not edit.
# Run `make sdk.gen` after changing a schema.

from __future__ import annotations

from enum import StrEnum

from pydantic import AwareDatetime, BaseModel, ConfigDict, RootModel, conint, constr


class Message1(BaseModel):
    """
    A single published message, as it arrives on a subscriber. Canonical shape emitted by Hela.Chat.Message.to_wire/1.
    """

    model_config = ConfigDict(
        extra="forbid",
    )
    id: constr(
        pattern=r"^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    )
    """
    UUIDv7. First 48 bits are unix-ms; lexicographic order = chronological.
    """
    channel: str
    """
    The logical channel name (no project prefix).
    """
    author: str
    """
    Opaque author identifier. Whatever the publisher passed.
    """
    body: str
    """
    The payload. Up to 4KB.
    """
    reply_to_id: (
        constr(
            pattern=r"^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
        )
        | None
    ) = None
    """
    If set, the id of the message this is a reply to. Same UUIDv7 shape.
    """
    node: str
    """
    Erlang node name that accepted the publish. Mostly for ops; clients can ignore.
    """
    inserted_at: AwareDatetime
    """
    ISO-8601 UTC timestamp. Same time as the id's embedded ms, to microsecond precision.
    """


class PublishRequest1(BaseModel):
    """
    Outgoing publish frame. Goes as the `publish` event payload on a joined channel.
    """

    model_config = ConfigDict(
        extra="forbid",
    )
    body: constr(max_length=4000)
    """
    The message body. Rejected if over 4KB.
    """
    author: str | None = None
    """
    Optional author override. Defaults to the channel's joined nickname.
    """
    reply_to_id: (
        constr(
            pattern=r"^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
        )
        | None
    ) = None
    """
    Optional. UUIDv7 of the message this replies to.
    """


class Quota(StrEnum):
    """
    Was this message within the project's monthly cap? `over` means delivered + persisted, but metered for overage billing.
    """

    ok = "ok"
    over = "over"


class PublishReply1(BaseModel):
    """
    Server's reply to a publish event.
    """

    model_config = ConfigDict(
        extra="forbid",
    )
    id: constr(
        pattern=r"^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    )
    """
    The UUIDv7 the server minted for this message.
    """
    quota: Quota
    """
    Was this message within the project's monthly cap? `over` means delivered + persisted, but metered for overage billing.
    """


class HistoryRequest1(BaseModel):
    """
    Cursor-paginated history query. `before` is a message id from the previous page; omit to get the latest N.
    """

    model_config = ConfigDict(
        extra="forbid",
    )
    before: (
        constr(
            pattern=r"^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
        )
        | None
    ) = None
    """
    Cursor — UUIDv7 of the oldest message on the previous page. Inclusive start, exclusive `before`.
    """
    limit: conint(ge=1, le=100) | None = 50


class Source(StrEnum):
    """
    `cache`: entirely from ETS hot-tier. `mixed`: cache + Postgres topup. `db`: cache miss, Postgres fall-through.
    """

    cache = "cache"
    mixed = "mixed"
    db = "db"


class HistoryReply1(BaseModel):
    """
    Ordered oldest → newest. `source` tells the client where the page came from so it can show cache-hit rate in dashboards or switch strategy.
    """

    model_config = ConfigDict(
        extra="forbid",
    )
    source: Source
    """
    `cache`: entirely from ETS hot-tier. `mixed`: cache + Postgres topup. `db`: cache miss, Postgres fall-through.
    """
    messages: list[Message1]


class JoinRequest1(BaseModel):
    """
    Payload for `phx_join` on a `chan:<project>:<channel>` topic.
    """

    model_config = ConfigDict(
        extra="forbid",
    )
    nickname: constr(max_length=64) | None = None
    """
    Display name used for presence roster + default author on publishes.
    """


class Source1(StrEnum):
    """
    Where the seed history came from — same semantics as history_reply.source.
    """

    cache = "cache"
    mixed = "mixed"
    db = "db"


class JoinReply1(BaseModel):
    """
    Server's reply to `phx_join`. Seeds the client with the most recent 50 messages + the cluster metadata.
    """

    model_config = ConfigDict(
        extra="forbid",
    )
    messages: list[Message1]
    """
    Most-recent-50 history, oldest first. Cache-hit preferred.
    """
    source: Source1
    """
    Where the seed history came from — same semantics as history_reply.source.
    """
    region: str
    """
    The region this gateway reports as (e.g. `iad`). Use it to pick the right region in the SDK config next time.
    """
    node: str
    """
    Erlang node name that served the join. Useful when debugging distributed behavior.
    """


class Meta(BaseModel):
    model_config = ConfigDict(
        extra="allow",
    )
    online_at: int
    """
    Unix seconds — when this meta was first tracked.
    """
    node: str
    """
    Erlang node that owns this connection.
    """
    region: str | None = None
    """
    Region slug of the gateway.
    """
    phx_ref: str | None = None
    """
    Internal tracker ref; carried so the CRDT can tell entries apart.
    """


class ErrorReply1(BaseModel):
    """
    Generic shape for error replies on the channel (status="error" phx_reply).
    """

    model_config = ConfigDict(
        extra="allow",
    )
    reason: str
    """
    Short machine-readable error code. Known values: `body_too_large`, `unauthorized_read`, `unauthorized_write`, `project_mismatch`, `rate_limited`, `bad_topic`.
    """
    retry_after_ms: conint(ge=0) | None = None
    """
    Present when `reason == rate_limited`. Milliseconds until the current rate bucket resets.
    """


class Message(RootModel[Message1]):
    root: Message1


class PublishRequest(RootModel[PublishRequest1]):
    root: PublishRequest1


class PublishReply(RootModel[PublishReply1]):
    root: PublishReply1


class HistoryRequest(RootModel[HistoryRequest1]):
    root: HistoryRequest1


class HistoryReply(RootModel[HistoryReply1]):
    root: HistoryReply1


class JoinRequest(RootModel[JoinRequest1]):
    root: JoinRequest1


class JoinReply(RootModel[JoinReply1]):
    root: JoinReply1


class Entry(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    metas: list[Meta]


class PresenceDiff1(BaseModel):
    """
    Incremental presence update. Apply to local state: leaves first, then joins. Clients that need full state should still initialize from presence_state on join.
    """

    model_config = ConfigDict(
        extra="forbid",
    )
    joins: dict[str, Entry] | None = None
    leaves: dict[str, Entry] | None = None


class ErrorReply(RootModel[ErrorReply1]):
    root: ErrorReply1


class PresenceState1(RootModel[dict[str, Entry]]):
    """
    Full roster emitted once after join. Keys are nicknames; values hold one metadata record per live connection that user has (same user connected twice = two metas).
    """

    root: dict[str, Entry]


class PresenceDiff(RootModel[PresenceDiff1]):
    root: PresenceDiff1


class PresenceState(RootModel[PresenceState1]):
    root: PresenceState1


class WireEvents(BaseModel):
    """
    Umbrella schema that references every WS event. This is the entry point datamodel-codegen (and other tools) read to emit a single types module covering the whole WS surface in one file.
    """

    message: Message | None = None
    publish_request: PublishRequest | None = None
    publish_reply: PublishReply | None = None
    history_request: HistoryRequest | None = None
    history_reply: HistoryReply | None = None
    join_request: JoinRequest | None = None
    join_reply: JoinReply | None = None
    presence_state: PresenceState | None = None
    presence_diff: PresenceDiff | None = None
    error: ErrorReply | None = None
