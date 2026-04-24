# adding a language

This is the recipe for shipping a hela SDK in a new language — Go,
Rust, Swift, Elixir-standalone, whatever. It's built to be cheap:
types are generated from schemas, only transport + the domain API
are written by hand. A first-cut SDK in a new language should land
in under a day.

Python and TypeScript are the two reference implementations. When in
doubt, copy their shape.

## what's in the box

Every SDK owns four layers. From bottom to top:

1. **Generated type module** — the Pydantic v2 classes / TS
   interfaces / Go structs / Rust enums for every wire payload.
   Auto-generated from [`packages/schemas/`](../../packages/schemas/).
2. **Transport** — speak Phoenix Channel v2 over a WebSocket:
   `[join_ref, ref, topic, event, payload]`, heartbeat every 30s,
   multiplex many channels on one socket.
3. **Domain API** — `connect()`, `client.channel(name).publish(…)`,
   `on_message`, presence. This is what users see.
4. **REST helper** — thin wrapper over the same language's HTTP
   client for `/v1/tokens`, `/v1/channels/:c/publish`, `/v1/channels/:c/history`,
   `/playground/token`.

## 1. generate types

Extend [`packages/sdk-gen/gen.py`](../../packages/sdk-gen/gen.py) with
a function that generates into your new package. Python uses
[datamodel-code-generator](https://github.com/koxudaxi/datamodel-code-generator);
TypeScript uses [json-schema-to-typescript](https://github.com/bcherny/json-schema-to-typescript).

For new languages you probably want:

| language | generator | notes |
| --- | --- | --- |
| Go | [oapi-codegen](https://github.com/deepmap/oapi-codegen) for REST, [quicktype](https://quicktype.io/) for WS | |
| Rust | [typify](https://github.com/oxidecomputer/typify) | serde-ready |
| Swift | [swift-openapi-generator](https://github.com/apple/swift-openapi-generator) + quicktype | |

The entry point is always `packages/schemas/wire/_index.schema.json`
(umbrella that $refs every WS event) and `packages/schemas/openapi.yaml`
(REST surface). Don't point generators at individual wire files —
the umbrella ensures every referenced event ends up in one module.

Commit the generated code. It's easier to diff than to regenerate
in CI-only.

## 2. transport

Pick a well-maintained WebSocket library for your language. Frame
format:

```
outgoing:  [join_ref, ref, topic, event, payload]
incoming:  [join_ref | null, ref | null, topic, event, payload]
```

Checklist:

- [ ] Client picks `ref` monotonically per outbound frame.
- [ ] Each channel has its own `join_ref` (= the ref of its
      `phx_join`).
- [ ] `phx_reply` routes by `ref` to a pending future / callback.
  `status: "ok"` → resolve with `response`. `status: "error"` →
  resolve with a typed exception keyed on `response.reason`.
- [ ] Heartbeat on the `phoenix` topic every 30s. Phoenix drops the
      socket at ~60s; don't bump past 45.
- [ ] Close semantics: cancel the reader task, abort pending
      replies with a clear error, drain subscriptions.

[`hela._transport.Socket`](../../packages/sdk-py/src/hela/_transport.py)
is the reference — about 250 lines of commented Python.

## 3. domain API

Expose five verbs and one type:

```
connect(region, token|playground_token, endpoint?) -> Client
client.channel(name) -> Channel
channel.join(nickname?) -> JoinReply
channel.publish(body, author?, reply_to_id?) -> PublishReply
channel.history(before?, limit?) -> HistoryReply
channel.on_message(handler)
channel.leave()
channel.presence  (has .list(), .on_sync(handler))
```

Map server errors to three typed exceptions:

- `UnauthorizedError` for `reason: unauthorized`
- `RateLimitedError(retry_after_ms)` for `reason: rate_limited`
- `ServerError(reason, payload)` for anything else

Everything else inherits from a `HelaError` base so callers can
catch the whole surface in one clause.

## 4. REST helper

Wrap your language's HTTP client. Surface:

- `mint_token(sub, chans, ttl_seconds)` → `/v1/tokens`
- `publish(channel, body, author?, reply_to_id?)` → `/v1/channels/:c/publish`
- `history(channel, before?, limit?)` → `/v1/channels/:c/history`
- `playground_token(sub?)` → `/playground/token` (no auth)

401 → `UnauthorizedError`. 429 → `RateLimitedError(retry_after_ms)`
(parse the JSON body, tolerate it being missing).

## 5. tests

Every SDK ships three test tiers:

1. **Type round-trips** — validate real wire payloads against the
   generated types. This is your drift alarm.
2. **Presence CRDT** — apply a state + a diff, confirm roster. The
   classic phoenix.js `Presence` unit tests port cleanly.
3. **Live integration** — signup → project → key → token →
   connect → publish → receive. Gated behind an env var
   (`HELA_LIVE=1` in Python) so the suite runs offline by default.

[`packages/sdk-py/tests/`](../../packages/sdk-py/tests/) is the
reference for all three. Copy it.

## 6. docs

- User-facing `README.md` at the package root. ~100 lines, focused
  on the 60-second tour.
- A doc page in `docs/sdk/<lang>.md` that mirrors `docs/sdk/python.md`.
  Link from `docs/index.md`.

## 7. CI

Wire your package into `.github/workflows/ci.yml`:

```yaml
sdk-<lang>:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v6
    - # language-specific setup
    - run: <lang-specific test command>
```

Plus the schema-drift guard — `make sdk.gen && git diff --exit-code`
— so someone can't land a schema change without regenerating.

## 8. release

- PyPI for Python, npm for TypeScript, crates.io for Rust, etc.
- GitHub Actions' OIDC trusted-publishing is preferred over long-lived
  tokens. See `.github/workflows/release.yml` for the pattern.
- SDK versioning is semver, independent per language. The schema
  version is separate and lives in `packages/schemas/VERSION`.

## pitfalls we've hit

- **Umbrella $refs produce suffixed names.** datamodel-codegen names
  the referenced `Message` model `Message1` when it appears under a
  `$ref`. Solution: re-export with a clean alias in the public
  module; don't fight the generator. See
  [`sdk-py/src/hela/__init__.py`](../../packages/sdk-py/src/hela/__init__.py).
- **Fire-and-forget tasks get GC'd.** `asyncio.ensure_future(coro)`
  without keeping a reference lets the loop collect it mid-flight.
  Stash it in a module-level set, discard on done.
- **Heartbeat interval drift.** Phoenix kills the socket at 60s
  without a heartbeat. Stick to 30s; don't let a user's
  "I'll set it to 45 to save CPU" PR land.
- **Leave must be tolerant.** If the socket is already closing,
  `push(phx_leave)` errors — that's fine, swallow it so `close()`
  can complete.

## checklist

Copy this into your language's PR description:

```
- [ ] Types generated from packages/schemas/
- [ ] Transport: Phoenix v2 wire protocol + heartbeat
- [ ] Domain API: connect / channel / join / publish / history / on_message / presence
- [ ] REST helper: mint_token / publish / history / playground_token
- [ ] Typed errors: UnauthorizedError / RateLimitedError / ServerError / base HelaError
- [ ] Unit tests: type round-trips, presence CRDT
- [ ] Live integration test, gated by env var
- [ ] docs/sdk/<lang>.md
- [ ] CI job + schema-drift guard
- [ ] Package published to the language's registry
```
