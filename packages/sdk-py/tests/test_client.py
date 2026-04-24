"""
Unit tests for `HelaClient` helpers that don't need a socket:
- URL composition per region
- `_peek_project_id` decoding of an HS256-ish JWT
"""

from __future__ import annotations

import base64
import json

from hela import HelaClient
from hela.client import _peek_project_id

# --- _peek_project_id -----------------------------------------------------


def _mk_jwt(claims: dict, *, header: dict | None = None, sig: str = "sig") -> str:
    """Produce a JWT-shaped string. The signature is junk — we don't verify."""

    def b64(obj: dict) -> str:
        return base64.urlsafe_b64encode(json.dumps(obj).encode()).rstrip(b"=").decode()

    h = header or {"alg": "HS256", "typ": "JWT"}
    return f"{b64(h)}.{b64(claims)}.{sig}"


def test_peek_project_id_happy_path():
    jwt = _mk_jwt({"pid": "proj_abc123", "sub": "user-1"})
    assert _peek_project_id(jwt) == "proj_abc123"


def test_peek_project_id_missing_pid():
    jwt = _mk_jwt({"sub": "user-1"})
    assert _peek_project_id(jwt) is None


def test_peek_project_id_empty_string():
    assert _peek_project_id("") is None


def test_peek_project_id_non_jwt_string():
    assert _peek_project_id("not.even.close") is None


def test_peek_project_id_malformed():
    # missing segments
    assert _peek_project_id("only-one-segment") is None


def test_peek_project_id_handles_unpadded_base64():
    """Our b64 emits without padding; decoder must re-add it."""
    jwt = _mk_jwt({"pid": "proj_x"})
    # sanity: the middle segment has no '=' padding
    assert "=" not in jwt.split(".")[1]
    assert _peek_project_id(jwt) == "proj_x"


def test_peek_project_id_non_string_pid():
    """pid must be a string — reject numeric / object claim values."""
    jwt = _mk_jwt({"pid": 12345})
    assert _peek_project_id(jwt) is None


# --- URL composition ------------------------------------------------------


def test_http_url_for_each_hosted_region():
    # hosted regions use https
    for region, host in [
        ("iad", "gateway-production-bfdf.up.railway.app"),
        ("sjc", "gateway-production-bfdf.up.railway.app"),
        ("ams", "gateway-production-bfdf.up.railway.app"),
        ("sin", "gateway-production-bfdf.up.railway.app"),
        ("syd", "gateway-production-bfdf.up.railway.app"),
    ]:
        c = HelaClient(region=region)
        assert c.http_url() == f"https://{host}"


def test_http_url_dev_uses_http():
    c = HelaClient(region="dev")
    assert c.http_url() == "http://localhost:4001"


def test_http_url_custom_endpoint_wins():
    c = HelaClient(region="dev", endpoint="http://127.0.0.1:9999")
    assert c.http_url() == "http://127.0.0.1:9999"


def test_ws_url_swaps_scheme_and_appends_websocket_path():
    c = HelaClient(region="iad")
    assert c._ws_url() == "wss://gateway-production-bfdf.up.railway.app/socket/websocket"

    c = HelaClient(region="dev")
    assert c._ws_url() == "ws://localhost:4001/socket/websocket"


def test_channel_before_connect_raises():
    c = HelaClient(region="iad", token=_mk_jwt({"pid": "proj_x"}))
    # no await connect() — channel() must explode cleanly
    try:
        c.channel("chat:lobby")
    except RuntimeError as e:
        assert "connect" in str(e)
    else:
        raise AssertionError("expected RuntimeError")
