# Auto-generated from packages/schemas/openapi.yaml. Do not edit.
# Run `make sdk.gen` after changing the spec.

from __future__ import annotations

from enum import StrEnum
from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, conint, constr


class Region(BaseModel):
    slug: str
    city: str
    host: str


class TokenRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    sub: str
    """
    Opaque id for the end-user this token represents.
    """
    chans: list[list[str]] | None = None
    """
    Scope grants. Each entry is `[scope, pattern]` where scope is `read` or `write` and pattern is a glob (`*` = one segment, `**` = rest).
    """
    ttl_seconds: conint(ge=1, le=86400) | None = 3600
    ephemeral: bool | None = None
    """
    If true, traffic sent with the minted JWT is broadcast-only. The
    gateway still delivers live messages to connected subscribers, but
    skips cache replay and Postgres persistence for that token.

    """


class TokenResponse(BaseModel):
    token: str
    """
    Bearer JWT, HS256-signed with the project's secret.
    """
    expires_in: int
    """
    Seconds until exp.
    """


class PublishRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    body: constr(max_length=4000)
    author: str | None = None
    reply_to_id: str | None = None


class Quota(StrEnum):
    ok = "ok"
    over = "over"


class PublishResponse(BaseModel):
    id: str
    inserted_at: AwareDatetime
    quota: Quota


class Source(StrEnum):
    cache = "cache"
    mixed = "mixed"
    db = "db"


class Message(BaseModel):
    id: str
    channel: str
    author: str
    body: str
    reply_to_id: str | None = None
    node: str
    inserted_at: AwareDatetime


class Scope1(StrEnum):
    read = "read"
    write = "write"


class Scope(BaseModel):
    scope: Scope1 | None = None
    pattern: str | None = None


class PlaygroundToken(BaseModel):
    token: str
    project_id: Literal["proj_public"]
    expires_in: int
    scopes: list[Scope]


class HistoryResponse(BaseModel):
    source: Source
    messages: list[Message]
