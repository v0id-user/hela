# Python SDK

`pip install hela` — async, typed, Pydantic-v2-first. Python 3.11+.

The package is [`hela` on PyPI](https://pypi.org/project/hela/)
and lives at [`packages/sdk-py/`](../../packages/sdk-py/) in the repo.

## install

```sh
pip install hela
# or
uv add hela
```

## the 60-second tour

```python
from hela import connect

async with (await connect(region="iad", token=my_jwt)) as client:
    chat = client.channel("chat:lobby")
    await chat.join(nickname="alice")

    @chat.on_message
    async def on_msg(msg):
        print(msg.author, msg.body)

    await chat.publish("hello")
```

Everything below expands on this.

## auth

Three ways a client gets a token:

1. **Customer JWT** — your backend signs a short-lived token per
   user and hands it to the browser or worker. Pass as `token=`.
2. **Playground token** — for landing-page demos.
   `await Hela(base_url=…, api_key=None).playground_token()` returns
   a 5-minute guest token scoped to the public sandbox project.
   Pass as `playground_token=`.
3. **Anonymous** — allowed for the `metrics:live` topic only. User
   channels reject.

Your backend mints user JWTs via the REST client:

```python
from hela.rest import Hela

async with Hela(base_url="https://iad.hela.dev", api_key=API_KEY) as h:
    resp = await h.mint_token(
        sub=str(user.id),
        chans=[["read", f"chat:room:{room.id}"], ["write", f"chat:room:{room.id}"]],
        ttl_seconds=300,
    )
    token = resp.token
```

## channels

```python
chat = client.channel("chat:lobby")
```

`channel()` returns a `HelaChannel` but sends no frames. You must
call `.join()` before publishing or listening.

```python
reply = await chat.join(nickname="alice", timeout=10.0)
reply.region   # "iad"
reply.node     # "gw@iad-1"
reply.source   # "cache" | "mixed" | "db"
reply.messages # most recent 50
```

### publish

```python
reply = await chat.publish("hello", author="alice")
reply.id        # UUIDv7 the server minted
reply.quota     # "ok" | "over" — "over" means billed as overage
```

`body` is capped at 4 KB. `author` defaults to the nickname passed
to `.join()`. `reply_to_id` threads a reply to an earlier message.

### history

```python
page = await chat.history(limit=50)
older = await chat.history(before=page.messages[0].id, limit=50)
```

Returns a `HistoryReply` with `source` and `messages`. Pages are
oldest→newest; use the first message's id as `before` for the next
page.

### on_message

```python
@chat.on_message
async def handle(msg):
    await store.save(msg)

# sync handlers work too:
@chat.on_message
def log(msg):
    print(msg.body)
```

Both sync and async handlers are supported. Async handlers run
fire-and-forget — errors inside them are your problem.

### leaving

```python
await chat.leave()
```

Idempotent, tolerant of an already-closed socket.

## presence

Every channel has a CRDT-backed roster at `channel.presence`.

```python
@chat.presence.on_sync
def rendered(users):
    print(f"online: {[u.id for u in users]}")
```

The callback fires:

- once immediately when you register it (so you don't wait for the
  next event to render),
- on every `presence_state` (full roster, emitted after join),
- on every `presence_diff` (merged leaves first, then joins).

`u.id` is the nickname (or JWT `sub` if no nickname was passed);
`u.metas` is a list of per-connection meta records (one entry per
live tab).

## errors

Everything the SDK raises inherits from `hela.HelaError`:

```python
from hela import HelaError, RateLimitedError, TimeoutError, UnauthorizedError

try:
    await chat.publish("burst")
except RateLimitedError as e:
    await asyncio.sleep(e.retry_after_ms / 1000)
    await chat.publish("burst")
except UnauthorizedError:
    # re-mint the JWT
    ...
except TimeoutError:
    # the push didn't get a reply inside the 10s default
    ...
```

| exception | when |
| --- | --- |
| `UnauthorizedError` | server rejected auth (401, or `reason: unauthorized`) |
| `RateLimitedError(retry_after_ms)` | per-second cap hit |
| `TimeoutError` | push's `timeout=` elapsed without a reply |
| `ServerError(reason, payload)` | any other `phx_reply` error |
| `HelaError` | base class — catch once to swallow all SDK errors |

## REST client

For server-side use — token minting, cron-job publishes, history
out-of-band. See [`hela.rest.Hela`](../../packages/sdk-py/src/hela/rest.py):

```python
from hela.rest import Hela

async with Hela(base_url="https://iad.hela.dev", api_key=API_KEY) as h:
    # mint a token for an end-user
    t = await h.mint_token(sub="user-42", ttl_seconds=300)

    # publish without opening a socket
    r = await h.publish("chat:lobby", "hi", author="server")

    # fetch old messages
    page = await h.history("chat:lobby", limit=100)
```

Bring your own `httpx.AsyncClient` via `http_client=` if you want
shared connection pooling, retries, or metrics.

## regions

```python
await connect(region="iad", token=my_jwt)
await connect(region="sjc", token=my_jwt)
# ...
await connect(region="dev", endpoint="http://localhost:4001", token=my_jwt)
```

Hosted slugs: `"iad"`, `"sjc"`, `"ams"`, `"sin"`, `"syd"`. The `"dev"`
slug + an explicit `endpoint=` points at a local gateway.

## reference

| symbol | what |
| --- | --- |
| `hela.connect` | open a WS + return a `HelaClient` |
| `hela.HelaClient` | the socket owner |
| `hela.HelaChannel` | a joined channel: publish, history, on_message |
| `hela.Presence`, `hela.PresenceEntry` | CRDT roster types |
| `hela.rest.Hela` | REST client |
| `hela.Message`, `PublishReply`, `HistoryReply`, … | Pydantic v2 types, generated from schemas |
| `hela.HelaError` and friends | exception hierarchy |

## internals

- Types under `hela._generated/` are auto-generated from
  [`packages/schemas/`](../../packages/schemas/) via
  [datamodel-code-generator](https://github.com/koxudaxi/datamodel-code-generator).
  Don't edit by hand; run `make sdk.gen` after changing a schema.
- The transport (`hela._transport.Socket`) speaks Phoenix Channel v2
  directly. See [api/websocket](../api/websocket.md) for the wire format.
- The package is tested with `pytest`. `HELA_LIVE=1 uv run pytest` in
  `packages/sdk-py/` runs the live-gateway integration suite.
