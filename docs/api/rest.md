# REST API

The gateway exposes a small REST surface for the things the WebSocket
is the wrong shape for: minting tokens from a backend, publishing
from a cron job, fetching history out-of-band.

The canonical spec is [`packages/schemas/openapi.yaml`](../../packages/schemas/openapi.yaml)
— it's OpenAPI 3.1 and every SDK's REST model module is generated
from it. If the examples here ever drift from the spec, the spec wins.

## base URLs

One per region. Pick the region where your project lives:

```
https://iad.hela.dev
https://sjc.hela.dev
https://ams.hela.dev
https://sin.hela.dev
https://syd.hela.dev
```

For local dev: `http://localhost:4001`.

## auth

Every `/v1/*` endpoint wants a Bearer token:

```
authorization: Bearer <api_key>
```

The API key is issued by control (`POST /api/projects/:id/keys`) and
shown exactly once. `/playground/*` endpoints are unauthenticated
and scoped to `proj_public`.

## endpoints

### `POST /v1/tokens` — mint a user JWT

Body:

```json
{
  "sub": "end-user-alice",
  "chans": [["read", "chat:*"], ["write", "chat:*"]],
  "ttl_seconds": 600
}
```

Response:

```json
{ "token": "eyJhbGc…", "expires_in": 600 }
```

`chans` is a list of `[scope, pattern]` pairs. `scope` is `"read"` or
`"write"`; `pattern` is a glob (`*` matches one segment, `**` matches
the rest). `ttl_seconds` is capped at 86400.

### `POST /v1/channels/:channel/publish` — server-side publish

Body:

```json
{ "body": "hello", "author": "server", "reply_to_id": null }
```

Response:

```json
{
  "id": "01901234-abcd-7def-8123-456789abcdef",
  "inserted_at": "2026-04-24T01:00:00Z",
  "quota": "ok"
}
```

Bypasses the WS entirely — useful from cron jobs, background workers,
or anywhere latency doesn't matter. Same rate limits as a WS
publish.

### `GET /v1/channels/:channel/history` — pages of past messages

Query params:

| param | default | notes |
| --- | --- | --- |
| `limit` | 50 | 1–100 |
| `before` | null | UUIDv7 of the oldest message on the previous page |

Response:

```json
{
  "source": "cache",
  "messages": [ { "id": "…", "author": "alice", "body": "…", … } ]
}
```

`source` is one of `cache` (everything from ETS hot-tier), `mixed`
(cache + Postgres topup), or `db` (full miss, Postgres fall-through).
Clients can surface this on internal dashboards.

### `POST /playground/token` — guest token for demos

Used by the landing-page demos. No API key required. Returns a
5-minute token scoped to `proj_public`.

### `GET /health` — liveness

200 OK with `{"ok": true, "region": "iad"}`. No auth.

### `GET /regions` — region directory

Returns every hosted region's slug, city, and host. Handy for an
SDK that wants to pick the nearest region dynamically.

## rate limits

Per project, per second. Tier caps:

| tier | publishes/sec | connections | monthly messages |
| --- | --- | --- | --- |
| starter | 15 | 500 | 1M |
| pro | 150 | 10k | 20M |
| scale | 1500 | 100k | 500M |

When you hit the cap, responses are `HTTP 429` with:

```json
{ "retry_after_ms": 320 }
```

The Python SDK maps this to `hela.RateLimitedError(retry_after_ms=320)`;
back off that long and retry.

## errors

All errors have `{"error": "<reason>", "message": "…"}`.

| status | reason | meaning |
| --- | --- | --- |
| 400 | `body_too_large` | payload over 4KB |
| 401 | `unauthorized` | missing/invalid API key |
| 403 | `scope_denied` | token doesn't grant that channel/scope |
| 429 | `rate_limited` | per-second bucket full |
| 500 | `internal` | file an issue — this shouldn't happen |
