# WebSocket API

The live path. SDKs wrap this — you only read this doc if you're
implementing a new SDK or debugging a weird frame.

Canonical schemas live in [`packages/schemas/wire/`](../../packages/schemas/wire/).
Every payload on the wire matches one of those JSON Schema files
byte-for-byte, and every SDK's type module is generated from them.

## endpoint

```
wss://<region>.hela.dev/socket/websocket?vsn=2.0.0&token=<jwt>
```

Required query params:

- `vsn=2.0.0` — Phoenix Channel protocol version. Anything else is
  rejected at handshake.
- `token` — the customer-signed JWT (or `playground=<token>` instead,
  for sandbox demos).

## frame format (Phoenix Channel v2)

Every frame is a JSON array:

```
[join_ref, ref, topic, event, payload]
```

- `join_ref` — client-chosen ref of the `phx_join` that opened the
  topic. Same for every subsequent frame on that topic.
- `ref` — client-chosen monotonic ref per outbound frame. The server
  echoes it in the matching `phx_reply` so clients can correlate.
  `null` on server-initiated frames.
- `topic` — `chan:<project_id>:<channel>` for user channels, or
  `phoenix` for the system heartbeat.
- `event` — see the event list below.
- `payload` — event-specific JSON object.

## topics

User channels are always `chan:<project_id>:<name>`. The project
prefix is enforced server-side; the SDK builds it from the JWT's
`pid` claim.

## events

Every event below links to its canonical JSON Schema under
`packages/schemas/wire/`.

### join + leave

- **`phx_join`** — outgoing. Payload matches
  [`join_request.schema.json`](../../packages/schemas/wire/join_request.schema.json).
  Reply carries the most recent 50 messages + `region` + `node`;
  see [`join_reply.schema.json`](../../packages/schemas/wire/join_reply.schema.json).
- **`phx_leave`** — outgoing. Empty payload. Server drops the
  subscription and the CRDT presence meta.

### publish + message

- **`publish`** — outgoing. Shape in
  [`publish_request.schema.json`](../../packages/schemas/wire/publish_request.schema.json).
  Body capped at 4 KB. Reply in
  [`publish_reply.schema.json`](../../packages/schemas/wire/publish_reply.schema.json).
- **`message`** — incoming. Server broadcasts every accepted publish
  to every joined client (including the publisher). Shape in
  [`message.schema.json`](../../packages/schemas/wire/message.schema.json).

### history

- **`history`** — outgoing. Cursor request in
  [`history_request.schema.json`](../../packages/schemas/wire/history_request.schema.json);
  reply in [`history_reply.schema.json`](../../packages/schemas/wire/history_reply.schema.json).
  `source` reports whether the page came from the hot ETS tier,
  mixed, or a Postgres fall-through.

### presence

- **`presence_state`** — incoming. Full roster, emitted once after
  join. See [`presence_state.schema.json`](../../packages/schemas/wire/presence_state.schema.json).
- **`presence_diff`** — incoming. Leaves + joins. Apply leaves first,
  then joins. See [`presence_diff.schema.json`](../../packages/schemas/wire/presence_diff.schema.json).

### system

- **`phx_reply`** — incoming. Shape `{"status": "ok"|"error", "response": ...}`.
  Client pairs on `ref`. Error replies match
  [`error_reply.schema.json`](../../packages/schemas/wire/error_reply.schema.json).
- **`heartbeat`** — outgoing on the `phoenix` topic, every 30s.
  Payload is `{}`. Phoenix drops the socket after ~60s without one.

## heartbeat example

```json
[null, "42", "phoenix", "heartbeat", {}]
```

Reply:

```json
[null, "42", "phoenix", "phx_reply", {"status": "ok", "response": {}}]
```

## error reasons

`phx_reply` with `status: "error"` has a machine-readable `reason`:

| reason | meaning |
| --- | --- |
| `bad_topic` | topic doesn't match `chan:<project>:<name>` |
| `project_mismatch` | JWT's `pid` doesn't match the topic's project |
| `unauthorized_read` / `unauthorized_write` | scope in JWT doesn't cover this channel |
| `body_too_large` | publish body over 4 KB |
| `rate_limited` | per-second cap — payload carries `retry_after_ms` |

SDKs map `unauthorized` to `UnauthorizedError`, `rate_limited` to
`RateLimitedError(retry_after_ms=…)`, and everything else to a
generic `ServerError(reason, payload)`.
