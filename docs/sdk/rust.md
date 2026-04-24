# Rust SDK

`hela` crate — `tokio` runtime, `tokio-tungstenite` WebSocket,
`reqwest` HTTP. MSRV 1.75. TLS via rustls + webpki-roots so nothing
links against the host OpenSSL.

Source: [`packages/sdk-rs/`](../../packages/sdk-rs/).

## install

```toml
[dependencies]
hela = "0.1"
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
```

## the 60-second tour

```rust
use hela::{Config, Region};

#[tokio::main]
async fn main() -> Result<(), hela::Error> {
    let client = hela::connect(Config {
        region: Region::Iad,
        token: Some(my_jwt),
        ..Default::default()
    }).await?;

    let chat = client.channel("chat:lobby");
    chat.on_message(|msg| println!("{}: {}", msg.author, msg.body));

    chat.join(hela::JoinRequest { nickname: Some("alice".into()) }).await?;
    chat.publish(hela::PublishRequest { body: "hello".into(), ..Default::default() }).await?;
    Ok(())
}
```

## auth

Mint tokens server-side via the REST client:

```rust
use hela::{Rest, RestOptions, TokenRequest};

let rest = Rest::new("https://gateway-production-bfdf.up.railway.app", RestOptions {
    api_key: Some(api_key),
    ..Default::default()
});
let resp = rest.mint_token(TokenRequest {
    sub:   user.id,
    chans: Some(vec![vec!["read".into(), "chat:*".into()]]),
    ttl_seconds: Some(300),
    ephemeral: false, // true → broadcast-only JWT from /v1/tokens
}).await?;
```

Then pass `resp.token` as `Config::token` on the client side.

**Ephemeral mode** — set `ephemeral: true` on [`TokenRequest`](../../packages/sdk-rs/src/types.rs)
when calling `mint_token` for broadcast-only HS256 grants from `/v1/tokens`.
For the public playground, use [`Rest::playground_token_ephemeral`](../../packages/sdk-rs/src/rest.rs)
instead of `playground_token` when you want the same semantics (live delivery
only; no join replay, no persistence).

## channels

```rust
let chat = client.channel("chat:lobby");

let reply  = chat.join(JoinRequest { nickname: Some("alice".into()) }).await?;
let pub_r  = chat.publish(PublishRequest { body: "hi".into(), ..Default::default() }).await?;
let page   = chat.history(HistoryRequest { limit: Some(50), ..Default::default() }).await?;

chat.on_message(|m| { /* ... */ });

chat.leave().await?;
```

Every method returns `Result<T, Error>`. Handlers registered via
`on_message` are `Fn(Message) + Send + Sync + 'static` — share state
through `Arc<Mutex<_>>` or a channel.

## presence

```rust
chat.presence.on_sync(|users| {
    for u in users {
        println!("{} @ {}", u.id, u.metas[0].node);
    }
});
```

`PresenceMeta::extras` holds any additional per-connection
metadata — custom app data lives there.

## errors

```rust
use hela::{Error, ErrorKind};

match chat.publish(req).await {
    Ok(_) => {}
    Err(e) => match e.kind() {
        ErrorKind::RateLimited { retry_after_ms } => {
            tokio::time::sleep(Duration::from_millis(*retry_after_ms as u64)).await;
        }
        ErrorKind::Unauthorized => { /* re-mint JWT */ }
        ErrorKind::Timeout { event, topic } => {
            eprintln!("{event} on {topic} stalled");
        }
        ErrorKind::ServerError { reason, .. } => eprintln!("server: {reason}"),
        ErrorKind::Transport(msg) | ErrorKind::Protocol(msg) | ErrorKind::Config(msg) => {
            eprintln!("{msg}");
        }
    }
}
```

`Error` carries an optional `source` chain (via `thiserror::Error`),
so standard `?` propagation from `serde_json` / `reqwest` /
`tokio-tungstenite` errors works out of the box.

## REST client

```rust
let rest = hela::Rest::new("https://gateway-production-bfdf.up.railway.app", hela::RestOptions {
    api_key: Some(api_key),
    ..Default::default()
});

let t    = rest.mint_token(TokenRequest { sub: "u1".into(), ttl_seconds: Some(300), ..Default::default() }).await?;
let pub_ = rest.publish("chat:lobby", PublishRequest { body: "hi".into(), ..Default::default() }).await?;
let page = rest.history("chat:lobby", HistoryRequest { limit: Some(100), ..Default::default() }).await?;
let guest = rest.playground_token(None).await?;
let _guest_ephemeral = rest.playground_token_ephemeral(None, true).await?;
```

Supply your own `reqwest::Client` via `RestOptions::http` to share
a connection pool or plug in middleware.

## regions

```rust
hela::Region::Iad   // Ashburn, US East
hela::Region::Sjc   // San Jose, US West
hela::Region::Ams   // Amsterdam
hela::Region::Sin   // Singapore
hela::Region::Syd   // Sydney
hela::Region::Dev   // localhost (pair with `endpoint`)
```

## reference

| symbol                      | what                                             |
| --------------------------- | ------------------------------------------------ |
| `connect(cfg)`              | open a WS, return a `Client`                     |
| `Client::channel(name)`     | create a `Channel`                               |
| `Channel::{join,publish,history,on_message,leave}` | domain API          |
| `Channel::presence`         | `Arc<Presence>` CRDT roster with `on_sync`       |
| `Rest::new(base, opts)`     | REST client                                      |
| `Error` / `ErrorKind`       | one-error surface, enum for matching             |

## internals

- Types hand-written in `src/types.rs` with `serde` derives. The
  surface is small (~11 types); `typify` output is larger than just
  writing it. Round-trip tests validate every payload against real
  schema shapes.
- Transport (`src/transport.rs`) speaks Phoenix Channel v2 directly
  over `tokio-tungstenite`. Heartbeat interval is 30 seconds.
- Live integration (`tests/integration.rs`) gated by `HELA_LIVE=1`.
- Run tests: `cargo test`. Clippy gate: `cargo clippy --all-targets -- -D warnings`.
- Format: `cargo fmt`. Format check: `cargo fmt --check`.
