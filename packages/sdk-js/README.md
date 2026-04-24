# @hela/sdk

TypeScript SDK for [hela](https://hela.dev). Browser + Node.

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

## Regions

hela runs regional clusters. Pick the one closest to your users.

| Region | City         | Host             |
| ------ | ------------ | ---------------- |
| iad    | Ashburn      | iad.hela.dev     |
| sjc    | San Jose     | sjc.hela.dev     |
| ams    | Amsterdam    | ams.hela.dev     |
| sin    | Singapore    | sin.hela.dev     |
| syd    | Sydney       | syd.hela.dev     |

`region` is fixed per project. Multi-region replication is an opt-in on
Scale and Enterprise tiers.
