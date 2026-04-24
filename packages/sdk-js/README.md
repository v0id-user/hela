# @hela/sdk

TypeScript SDK for [hela](https://github.com/v0id-user/hela). Browser + Node.

```
npm install @hela/sdk
```

## Browser

```ts
import { connect } from "@hela/sdk";

// Your backend signs a short-lived JWT and hands it to the browser.
const token = await fetch("/api/hela-token").then(r => r.text());

const client = connect({ region: "iad", token });
const chat = client.channel("chat:room42");

const { messages } = await chat.join();
chat.onMessage(m => console.log(m.author, m.body));
await chat.publish("hello");

chat.presence.onSync(users => {
  console.log(users.length, "online");
});
```

## Node (issuing JWTs)

hela verifies JWTs signed by a public key you register in the dashboard.
Sign short-lived tokens on your backend with your private key:

```ts
import { SignJWT, importPKCS8 } from "jose";

const key = await importPKCS8(process.env.HELA_PRIVATE_KEY!, "RS256");
const token = await new SignJWT({
  pid: "proj_abc123",
  sub: userId,
  chans: [["read", "chat:*"], ["write", `chat:room:${roomId}`]],
  ephemeral: false,
})
  .setProtectedHeader({ alg: "RS256" })
  .setExpirationTime("5m")
  .sign(key);
```

Or have hela sign for you via `POST /v1/tokens` with an API key:

```ts
const res = await fetch("https://gateway-production-bfdf.up.railway.app/v1/tokens", {
  method: "POST",
  headers: { authorization: `Bearer ${process.env.HELA_API_KEY}` },
  body: JSON.stringify({
    sub: userId,
    chans: [["read", "chat:*"], ["write", `chat:room:${roomId}`]],
    ephemeral: false,
  }),
});
const { token } = await res.json();
```

Set `ephemeral: true` when you want broadcast-only traffic: connected
subscribers still receive live messages, but the gateway skips replay
history and Postgres persistence for that token's publishes.

## Playground token helper

For the public sandbox project (`proj_public`), you can mint a guest JWT
with `issuePlaygroundToken` instead of wiring `fetch` yourself:

```ts
import { connect, issuePlaygroundToken } from "@hela/sdk";

const { token } = await issuePlaygroundToken({ ephemeral: true });
const client = connect({ region: "iad", playgroundToken: token });
```

Pass `ephemeral: true` for broadcast-only playground traffic; omit it (or
`false`) when you need join replay and persistence (default demos).

## Regions

hela runs regional clusters. Today the hosted plane is a single `ams`
service; `iad`, `sjc`, `sin`, `syd` are planned regions and the SDK
transparently routes them to the live gateway until they come up.

| Region | City         | Host                                       |
| ------ | ------------ | ------------------------------------------ |
| ams    | Amsterdam    | gateway-production-bfdf.up.railway.app     |

`region` is fixed per project. Multi-region replication is an opt-in on
Scale and Enterprise tiers.
