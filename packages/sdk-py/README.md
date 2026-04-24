# hela

Python SDK for [hela](https://hela.dev) — managed real-time on BEAM.
Async, typed, small. Supports Python 3.11+.

```sh
pip install hela
# or
uv add hela
```

## 60 seconds

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

## auth modes

- **customer JWT** (normal path) — your backend signs a short-lived
  token and hands it to the browser or worker. Pass as `token=`.
- **playground token** (landing-page demos) — `await hela.playground_token()`
  returns a 5-minute guest token scoped to the public sandbox project.
  Pass as `playground_token=`.

Your backend can mint tokens via the REST client:

```python
from hela.rest import Hela

async with Hela(base_url="https://iad.hela.dev", api_key=os.environ["HELA_API_KEY"]) as hela:
    resp = await hela.mint_token(
        sub=str(user.id),
        chans=[["read", f"chat:room:{room.id}"], ["write", f"chat:room:{room.id}"]],
        ttl_seconds=300,
    )
    return resp.token
```

## presence

Every channel has a CRDT-backed presence roster:

```python
@chat.presence.on_sync
def rendered(users):
    print(f"online: {[u.id for u in users]}")
```

The callback fires on every state update and every diff, already merged.

## rate limiting

Your project's tier caps publishes at N/second. Crossing that raises:

```python
from hela import RateLimitedError

try:
    await chat.publish("burst")
except RateLimitedError as e:
    await asyncio.sleep(e.retry_after_ms / 1000)
    await chat.publish("burst")
```

## regions

`region="iad"|"sjc"|"fra"|"sin"|"syd"` picks a hosted cluster.
`region="dev"` + `endpoint="http://localhost:4001"` is for local hela.

## what's inside

| module | what it does |
| --- | --- |
| `hela.connect`, `hela.HelaClient` | entry point, WebSocket lifecycle |
| `hela.HelaChannel` | joined channel: publish, history, on_message |
| `hela.Presence` | CRDT roster mirroring |
| `hela.rest.Hela` | REST client for server-side use |
| `hela.Message`, `hela.PublishReply`, … | Pydantic v2 types (auto-generated) |

Types are generated from `packages/schemas/`. Transport + the domain API
are hand-written. The SDK is tested with `pytest` + a live-gateway
integration suite — see `tests/`.

## license

AGPL-3.0-or-later. See LICENSE in the repo root.
