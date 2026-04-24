"""
SDK-level exception hierarchy. All raised from `hela.*` inherit from
`HelaError` so users can catch everything with one except clause.
"""

from __future__ import annotations

from typing import Any


class HelaError(Exception):
    """Base class for every exception raised by the hela SDK."""


class UnauthorizedError(HelaError):
    """
    Server rejected auth. Returned for 401s on REST and for
    `{:error, unauthorized}` replies at WS connect.
    """


class RateLimitedError(HelaError):
    """
    Publish rejected by the per-second rate limiter. `retry_after_ms` is
    the milliseconds until the current bucket resets; use it for backoff.
    """

    def __init__(self, retry_after_ms: int, message: str = "rate limited"):
        super().__init__(message)
        self.retry_after_ms = retry_after_ms


class TimeoutError(HelaError):
    """
    A Phoenix Channel push didn't get a reply inside the timeout.
    Surfaced rather than hanging the caller's coroutine forever.
    """


class ServerError(HelaError):
    """
    Unexpected server-side error. `reason` is the machine-readable code,
    `payload` is the full error reply for debugging.
    """

    def __init__(self, reason: str, payload: dict[str, Any] | None = None):
        super().__init__(reason)
        self.reason = reason
        self.payload = payload or {}
