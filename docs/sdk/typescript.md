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

// anonymous — only the metrics:live topic works
await connect({ region: "iad" });
```

Mint user JWTs from your backend via the REST surface; there's no
dedicated REST wrapper in `@hela/sdk` yet, but `fetch` is fine:

```ts
const r = await fetch(`https://iad.hela.dev/v1/tokens`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: `Bearer ${process.env.HELA_API_KEY}`,
  },
  body: JSON.stringify({
    sub: user.id,
    chans: [["read", `chat:room:${roomId}`], ["write", `chat:room:${roomId}`]],
    ttl_seconds: 300,
  }),
});
const { token } = await r.json();
```

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
unsub();  // remove the listener

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
    return () => { ch?.leave(); };
  }, [token, name]);
  return channel;
}
```

For anything richer, build on top — there's no framework binding
shipped in the SDK.

## presence

```ts
chat.presence.onSync((users) => {
  console.log(`online: ${users.map(u => u.id).join(", ")}`);
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
    await new Promise(r => setTimeout(r, e.retry_after_ms));
    // retry
  }
}
```

## regions

```ts
import { connect, REGIONS } from "@hela/sdk";

// hosted: "iad" | "sjc" | "fra" | "sin" | "syd"
await connect({ region: "iad", token });

// local dev:
await connect({ region: "dev", endpoint: "http://localhost:4001", token });

console.log(REGIONS);
// { iad: { city: "Ashburn, US East", host: "iad.hela.dev" }, ... }
```

## reference

| symbol | what |
| --- | --- |
| `connect(config)` | open a WS + return a `HelaClient` |
| `HelaClient` | the socket owner |
| `HelaClient#channel(name)` | create a channel handle |
| `HelaChannel` | joined channel: `join`, `publish`, `history`, `onMessage`, `leave` |
| `HelaPresence` | CRDT roster with `onSync` |
| `REGIONS`, `wsUrl`, `httpUrl` | region helpers |
| `issuePlaygroundToken()` | mint a 5-min guest token |
| `Message`, `HistoryReply`, `JoinReply`, `PresenceEntry` | generated types |

## internals

- Types come from `@hela/sdk-types`, regenerated from
  [`packages/schemas/`](../../packages/schemas/). Run `make sdk.gen`
  after schema changes.
- The transport is phoenix.js (`^1.8`). We don't reimplement its
  channel protocol in browser — phoenix.js is the reference.
