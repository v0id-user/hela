# quickstart

Send your first message in five minutes. You'll:

1. create an account + project
2. issue an API key
3. mint a short-lived user JWT
4. connect, join a channel, publish a message

## 1. sign up

```sh
curl -sS https://control.hela.dev/auth/signup \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com"}' \
  -c cookies.txt
```

The response carries a session cookie (stored in `cookies.txt`). All
`/api/*` endpoints on control require it.

## 2. create a project

```sh
curl -sS https://control.hela.dev/api/projects \
  -H 'content-type: application/json' \
  -b cookies.txt \
  -d '{"name":"my-app","region":"iad","tier":"starter"}'
```

Response includes `project.id` (e.g. `proj_01j9abc…`). Keep it.

## 3. issue an API key

```sh
curl -sS https://control.hela.dev/api/projects/PROJECT_ID/keys \
  -H 'content-type: application/json' \
  -b cookies.txt \
  -d '{"label":"server-side"}'
```

The `wire` field is shown **once**. Treat it like a password. Your
backend uses it to mint user tokens.

## 4. mint a user JWT

Never ship the API key to the browser. Your backend calls
`/v1/tokens` on the regional gateway:

```python
from hela.rest import Hela

async with Hela(base_url="https://iad.hela.dev", api_key=API_KEY) as h:
    token = (await h.mint_token(
        sub="end-user-alice",
        chans=[["read", "chat:*"], ["write", "chat:*"]],
        ttl_seconds=600,
    )).token
```

The JWT is HS256-signed with your project's secret, carries the
requested scopes, and lasts up to `ttl_seconds`.

## 5. connect and publish

```python
from hela import connect

async with (await connect(region="iad", token=token)) as client:
    chat = client.channel("chat:lobby")
    await chat.join(nickname="alice")

    @chat.on_message
    async def on_msg(msg):
        print(msg.author, msg.body)

    await chat.publish("hello from quickstart")
```

That's the whole loop. The callback fires on the self-broadcast too,
so you'll see your own message appear.

## next steps

- **Presence.** Every channel has a CRDT roster — read
  [sdk/python#presence](./sdk/python.md#presence).
- **Scaling past the free tier.** The rate limiter is real and
  aggressive; see [api/rest#rate-limits](./api/rest.md#rate-limits).
- **Local dev.** Run a gateway locally with `mix phx.server` in
  `apps/gateway/` and pass `region="dev"` + `endpoint="http://localhost:4001"`.
