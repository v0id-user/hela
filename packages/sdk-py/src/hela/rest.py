"""
Thin REST helpers. The WS flow is the hot path; these cover the
request/response corners — minting tokens from your backend, fetching
history out-of-band, publishing from a cron job.

`Hela` wraps `httpx.AsyncClient` — pass your own via `http_client=` to
plug in retries, metrics, or a shared pool.
"""

from __future__ import annotations

import contextlib
from typing import Any

import httpx

from hela._generated.rest import (
    HistoryResponse,
    PlaygroundToken,
    PublishRequest,
    PublishResponse,
    TokenRequest,
    TokenResponse,
)
from hela.errors import RateLimitedError, UnauthorizedError


class Hela:
    """
    REST client. One per base URL.

        async with Hela(base_url="https://iad.hela.dev", api_key=key) as hela:
            token = await hela.mint_token(sub="user-42", chans=[["read","chat:*"]])
            await hela.publish("chat:lobby", "hi", author="server")
    """

    def __init__(
        self,
        *,
        base_url: str,
        api_key: str | None = None,
        http_client: httpx.AsyncClient | None = None,
    ):
        self._base = base_url.rstrip("/")
        self._api_key = api_key
        self._owned_client = http_client is None
        self._client = http_client or httpx.AsyncClient(timeout=15.0)

    async def __aenter__(self) -> Hela:
        return self

    async def __aexit__(self, *exc: Any) -> None:
        await self.close()

    async def close(self) -> None:
        if self._owned_client:
            await self._client.aclose()

    # --- auth ------------------------------------------------------------

    async def mint_token(
        self,
        *,
        sub: str,
        chans: list[list[str]] | None = None,
        ttl_seconds: int = 3600,
    ) -> TokenResponse:
        """
        Ask the gateway to sign a short-lived HS256 JWT bound to this
        project. Use it on the WebSocket `token` param.
        """
        body = TokenRequest(
            sub=sub,
            chans=chans,
            ttl_seconds=ttl_seconds,
        ).model_dump(exclude_none=True)
        r = await self._post("/v1/tokens", body)
        return TokenResponse.model_validate(r)

    async def playground_token(self, *, sub: str | None = None) -> PlaygroundToken:
        """Issue a guest token for the public sandbox project."""
        body: dict[str, Any] = {}
        if sub is not None:
            body["sub"] = sub
        r = await self._post("/playground/token", body, auth=False)
        return PlaygroundToken.model_validate(r)

    # --- channels --------------------------------------------------------

    async def publish(
        self,
        channel: str,
        body: str,
        *,
        author: str | None = None,
        reply_to_id: str | None = None,
    ) -> PublishResponse:
        """
        Server-side publish. Bypasses the WS entirely — useful from
        cron jobs, background workers, or anywhere latency doesn't
        matter and you'd rather keep one fewer connection open.
        """
        req_body = PublishRequest(
            body=body,
            author=author,
            reply_to_id=reply_to_id,
        ).model_dump(exclude_none=True)
        r = await self._post(f"/v1/channels/{channel}/publish", req_body)
        return PublishResponse.model_validate(r)

    async def history(
        self,
        channel: str,
        *,
        before: str | None = None,
        limit: int = 50,
    ) -> HistoryResponse:
        """Cursor-paginated history via REST."""
        params: dict[str, Any] = {"limit": limit}
        if before is not None:
            params["before"] = before
        r = await self._get(f"/v1/channels/{channel}/history", params)
        return HistoryResponse.model_validate(r)

    # --- internal HTTP --------------------------------------------------

    def _headers(self, *, auth: bool = True) -> dict[str, str]:
        h = {"content-type": "application/json"}
        if auth and self._api_key:
            h["authorization"] = f"Bearer {self._api_key}"
        return h

    async def _post(self, path: str, body: Any, *, auth: bool = True) -> Any:
        r = await self._client.post(
            self._base + path,
            json=body,
            headers=self._headers(auth=auth),
        )
        return self._handle(r)

    async def _get(self, path: str, params: dict[str, Any]) -> Any:
        r = await self._client.get(
            self._base + path,
            params=params,
            headers=self._headers(auth=True),
        )
        return self._handle(r)

    @staticmethod
    def _handle(r: httpx.Response) -> Any:
        if r.status_code == 401:
            raise UnauthorizedError(r.text[:200])
        if r.status_code == 429:
            retry_ms = 0
            # Server is expected to send `{"retry_after_ms": N}` but we
            # tolerate missing/invalid JSON so clients still get the
            # right exception type, just without a backoff hint.
            with contextlib.suppress(Exception):
                retry_ms = int(r.json().get("retry_after_ms", 0))
            raise RateLimitedError(retry_after_ms=retry_ms)
        r.raise_for_status()
        return r.json()
