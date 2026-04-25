# TypeScript SDK

`@hela/sdk` — browser + Node. Wraps phoenix.js, typed against the
canonical schemas, works in any runtime with `WebSocket` +
`fetch`.

The package source is at [`packages/sdk-js/`](../../packages/sdk-js/).

## install

```sh
pnpm add @hela/sdk
# or
npm i @hela/sdk
```

## the 60-second tour

```ts
import { connect } from "@hela/sdk";

const client = await connect({ region: "iad", token: myJwt });
const chat = client.channel("chat:lobby");

await chat.join({ nickname: "alice" });

chat.onMessage((msg) => {
  console.log(msg.author, msg.body);
});

await chat.publish("hello");
```

## auth

Three modes, same as the Python SDK:

```ts
// customer JWT — minted by your backend
await connect({ region: "iad", token: myJwt });

// playground token — 5-min guest, for demos
import { issuePlaygroundToken } from "@hela/sdk";
const { token } = await issuePlaygroundToken();
await connect({ region: "iad", playgroundToken: token });

// broadcast-only playground token (no join replay, no persistence)
const { token: liveOnly } = await issuePlaygroundToken({ ephemeral: true });
await connect({ region: "iad", playgroundToken: liveOnly });

// anonymous — only the metrics:live topic works
await connect({ region: "iad" });
```

Mint user JWTs from your backend via the REST surface; there's no
dedicated REST wrapper in `@hela/sdk` yet, but `fetch` is fine:

```ts
const r = await fetch(`https://gateway-production-bfdf.up.railway.app/v1/tokens`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: `Bearer ${process.env.HELA_API_KEY}`,
  },
  body: JSON.stringify({
    sub: user.id,
    chans: [
      ["read", `chat:room:${roomId}`],
      ["write", `chat:room:${roomId}`],
    ],
    ttl_seconds: 300,
    // optional: ephemeral: true  → broadcast-only for this JWT on the gateway
  }),
});
const { token } = await r.json();
```

Include `"ephemeral": true` in that JSON body when you want the same
broadcast-only semantics as `issuePlaygroundToken({ ephemeral: true })`
for customer-minted HS256 tokens via `/v1/tokens`.

### token rotation and reconnect

The JWT is verified **once** at WebSocket handshake. The gateway
attaches the claims to the socket and never re-checks the token for
the life of that connection. So:

- Calling `client.setToken(newJwt)` while the socket is open updates
  the cached token but does not affect the running session.
- The new token is used the **next** time `phoenix.js` reconnects
  (network blip, server restart, etc.). The SDK's `params()` callback
  rebuilds the URL with whatever token is in memory at that moment.

The right pattern for refreshing tokens in a long-lived browser
session: refresh **on `onClose` / `onError`**, not on a timer. A
healthy socket pays zero refresh requests; a dropped socket gets
fresh credentials in flight by the time the reconnect fires.

```ts
client.onClose(() => {
  void mintFreshToken().then((t) => client.setToken(t));
});
```

A `setTimeout` that refreshes before expiry on a healthy socket is
wasted bandwidth — it served no purpose for the open WS, since the
gateway is already past the auth check. See
[`docs/api/websocket.md` § auth lifecycle](../api/websocket.md#auth-lifecycle)
for the protocol contract.

## channels

```ts
const chat = client.channel("chat:lobby");
const reply = await chat.join({ nickname: "alice" });
// reply: { region, node, source, messages }

const pubAck = await chat.publish("hello", { author: "alice" });
// pubAck: { id, quota }

const page = await chat.history({ limit: 50 });
// page: { source, messages }

const unsub = chat.onMessage((msg) => console.log(msg));
unsub(); // remove the listener

await chat.leave();
```

### react

The idiomatic pattern:

```tsx
import { connect } from "@hela/sdk";
import { useEffect, useState } from "react";

function useChannel(token: string, name: string) {
  const [channel, setChannel] = useState(null);
  useEffect(() => {
    let ch: any;
    (async () => {
      const client = await connect({ region: "iad", token });
      ch = client.channel(name);
      await ch.join();
      setChannel(ch);
    })();
    return () => {
      ch?.leave();
    };
  }, [token, name]);
  return channel;
}
```

For anything richer, build on top — there's no framework binding
shipped in the SDK.

## presence

```ts
chat.presence.onSync((users) => {
  console.log(`online: ${users.map((u) => u.id).join(", ")}`);
});
```

Same semantics as the Python SDK: one fire on register, one on every
`presence_state`, one on every merged `presence_diff`. `u.id` is the
nickname (or JWT `sub`); `u.metas` is a list of per-connection metas.

## errors

phoenix.js wraps replies into `{ status, response }`. The SDK's
`channel.publish()` throws a typed error when `status === "error"`:

```ts
try {
  await chat.publish("x");
} catch (e) {
  if (e.reason === "rate_limited") {
    await new Promise((r) => setTimeout(r, e.retry_after_ms));
    // retry
  }
}
```

## regions

```ts
import { connect, REGIONS } from "@hela/sdk";

// hosted: "iad" | "sjc" | "ams" | "sin" | "syd"
await connect({ region: "iad", token });

// local dev:
await connect({ region: "dev", endpoint: "http://localhost:4001", token });

console.log(REGIONS);
// { iad: { city: "Ashburn, US East", host: "gateway-production-bfdf.up.railway.app" }, ... }
```

## reference

| symbol                                                  | what                                                                   |
| ------------------------------------------------------- | ---------------------------------------------------------------------- |
| `connect(config)`                                       | open a WS + return a `HelaClient`                                      |
| `HelaClient`                                            | the socket owner                                                       |
| `HelaClient#channel(name)`                              | create a channel handle                                                |
| `HelaChannel`                                           | joined channel: `join`, `publish`, `history`, `onMessage`, `leave`     |
| `HelaPresence`                                          | CRDT roster with `onSync`                                              |
| `REGIONS`, `wsUrl`, `httpUrl`                           | region helpers                                                         |
| `issuePlaygroundToken(opts?)`                           | mint a 5-min guest token; set `opts.ephemeral` for broadcast-only JWTs |
| `Message`, `HistoryReply`, `JoinReply`, `PresenceEntry` | generated types                                                        |

## internals

- Types come from `@hela/sdk-types`, regenerated from
  [`packages/schemas/`](../../packages/schemas/). Run `make sdk.gen`
  after schema changes.
- The transport is phoenix.js (`^1.8`). We don't reimplement its
  channel protocol in browser — phoenix.js is the reference.
