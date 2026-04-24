"""
Every SDK-raised exception inherits from `HelaError` so callers can
catch the whole surface in one except clause. Lock that in.
"""

from __future__ import annotations

import pytest

from hela import HelaError, RateLimitedError, TimeoutError, UnauthorizedError
from hela.errors import ServerError


@pytest.mark.parametrize(
    "cls",
    [RateLimitedError, TimeoutError, UnauthorizedError, ServerError],
)
def test_every_error_subclasses_helaerror(cls):
    assert issubclass(cls, HelaError)


def test_rate_limited_carries_retry_after_ms():
    e = RateLimitedError(retry_after_ms=1234)
    assert e.retry_after_ms == 1234
    # default message is stable for UX
    assert str(e) == "rate limited"


def test_server_error_defaults_payload_to_empty_dict():
    e = ServerError("boom")
    assert e.reason == "boom"
    assert e.payload == {}


def test_server_error_keeps_given_payload():
    e = ServerError("rate_limited", {"retry_after_ms": 500})
    assert e.reason == "rate_limited"
    assert e.payload["retry_after_ms"] == 500


def test_timeout_error_is_not_builtin_timeout():
    """
    We deliberately shadow the builtin inside our namespace so users
    catch `hela.TimeoutError`, not `asyncio.TimeoutError`. Prove it's
    distinct so nobody catches `builtins.TimeoutError` expecting ours.
    """
    import builtins

    assert TimeoutError is not builtins.TimeoutError
