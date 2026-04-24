"""
Public entry-point. `connect(...)` is the shortest path; `HelaClient` is
the class most apps reach for.

Usage:

    from hela import connect

    async with connect(region="iad", token=my_jwt) as client:
        chat = client.channel("chat:lobby")
        await chat.join(nickname="alice")
        await chat.publish("hello")
"""

from __future__ import annotations

import base64
import json
from typing import Literal

from hela._transport import Socket
from hela.channel import HelaChannel

Region = Literal["iad", "sjc", "ams", "sin", "syd", "dev"]

_REGIONS: dict[str, dict[str, str]] = {
    "iad": {"city": "Ashburn, US East", "host": "gateway-production-bfdf.up.railway.app"},
    "sjc": {"city": "San Jose, US West", "host": "gateway-production-bfdf.up.railway.app"},
    "ams": {"city": "Amsterdam, EU", "host": "gateway-production-bfdf.up.railway.app"},
    "sin": {"city": "Singapore, Asia", "host": "gateway-production-bfdf.up.railway.app"},
    "syd": {"city": "Sydney, AU", "host": "gateway-production-bfdf.up.railway.app"},
    "dev": {"city": "local dev", "host": "localhost:4001"},
}


class HelaClient:
    """
    One client per app. Owns a single WebSocket that every channel
    multiplexes over.
    """

    def __init__(
        self,
        *,
        region: Region,
        token: str | None = None,
        playground_token: str | None = None,
        endpoint: str | None = None,
    ):
        if token is None and playground_token is None:
            # Anonymous connect is allowed on the gateway (metrics:live
            # channel works without a token). User channels (`chan:*`)
            # will reject on join if project_id is unknown.
            pass

        self._region = region
        self._token = token
        self._playground_token = playground_token
        self._endpoint = endpoint
        self._socket: Socket | None = None
        self._project_id = _peek_project_id(token or playground_token or "")

    # --- lifecycle -------------------------------------------------------

    async def connect(self) -> HelaClient:
        """
        Open the underlying WebSocket. Idempotent. Returns self so it
        chains after the constructor: `client = await HelaClient(...).connect()`.
        """
        if self._socket is not None:
            return self

        params: dict[str, str] = {"vsn": "2.0.0"}
        if self._token is not None:
            params["token"] = self._token
        if self._playground_token is not None:
            params["playground"] = self._playground_token

        self._socket = Socket(url=self._ws_url(), params=params)
        await self._socket.connect()
        return self

    async def close(self) -> None:
        if self._socket is not None:
            await self._socket.close()
            self._socket = None

    async def __aenter__(self) -> HelaClient:
        return await self.connect()

    async def __aexit__(self, exc_type, exc, tb) -> None:
        await self.close()

    # --- channels --------------------------------------------------------

    def channel(self, name: str) -> HelaChannel:
        """
        Create a channel handle. Doesn't send any frames until you call
        `.join()` on the returned object.
        """
        if self._socket is None:
            raise RuntimeError("channel() called before connect()")

        project_id = self._project_id or "proj_public"
        topic = f"chan:{project_id}:{name}"
        return HelaChannel(
            socket=self._socket,
            topic=topic,
            channel_name=name,
            project_id=project_id,
        )

    # --- URLs ------------------------------------------------------------

    @property
    def region(self) -> Region:
        return self._region

    def http_url(self) -> str:
        if self._endpoint is not None:
            return self._endpoint
        r = _REGIONS[self._region]
        scheme = "http" if self._region == "dev" else "https"
        return f"{scheme}://{r['host']}"

    def _ws_url(self) -> str:
        base = self.http_url()
        return base.replace("http", "ws", 1) + "/socket/websocket"


async def connect(
    *,
    region: Region,
    token: str | None = None,
    playground_token: str | None = None,
    endpoint: str | None = None,
) -> HelaClient:
    """
    One-liner: build, connect, return. Most apps use this.

    Pair with async-with for automatic cleanup::

        async with (await connect(region="iad", token=jwt)) as client:
            ...
    """
    client = HelaClient(
        region=region,
        token=token,
        playground_token=playground_token,
        endpoint=endpoint,
    )
    return await client.connect()


# --- helpers ------------------------------------------------------------


def _peek_project_id(jwt: str) -> str | None:
    """
    JWT's `pid` claim is what the server uses to scope the socket. We
    decode (don't verify — server is the verifier) so we can prefix
    channel topics correctly. Safe for HS256 and RS256 tokens alike.
    """
    if not jwt or "." not in jwt:
        return None
    try:
        _, b64, _ = jwt.split(".", 2)
        padding = "=" * (-len(b64) % 4)
        claims = json.loads(base64.urlsafe_b64decode(b64 + padding))
        pid = claims.get("pid")
        return pid if isinstance(pid, str) else None
    except (ValueError, json.JSONDecodeError):
        return None
