# hela (Rust)

Rust SDK for [hela](https://hela.dev) — managed real-time on BEAM.
`tokio` runtime, `tokio-tungstenite` WebSocket, `reqwest` REST.
MSRV 1.75.

```toml
[dependencies]
hela = "0.1"
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
```

## 60 seconds

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

    chat.join(hela::JoinRequest {
        nickname: Some("alice".into()),
    }).await?;

    chat.publish(hela::PublishRequest {
        body: "hello".into(),
        ..Default::default()
    }).await?;

    Ok(())
}
```

## auth

```rust
// customer JWT, minted by your backend
let client = hela::connect(Config {
    region: Region::Iad,
    token: Some(jwt),
    ..Default::default()
}).await?;

// playground (sandbox demos)
let client = hela::connect(Config {
    region: Region::Iad,
    playground_token: Some(guest),
    ..Default::default()
}).await?;
```

Mint user JWTs via the REST client:

```rust
use hela::{Rest, RestOptions, TokenRequest};

let rest = Rest::new("https://gateway-production-bfdf.up.railway.app", RestOptions {
    api_key: Some(std::env::var("HELA_API_KEY").unwrap()),
    ..Default::default()
});
let resp = rest.mint_token(TokenRequest {
    sub: user_id.into(),
    chans: Some(vec![
        vec!["read".into(),  format!("chat:room:{}", room_id)],
        vec!["write".into(), format!("chat:room:{}", room_id)],
    ]),
    ttl_seconds: Some(300),
    ephemeral: false, // true → broadcast-only JWT from /v1/tokens
}).await?;
```

## presence

```rust
chat.presence.on_sync(|users| {
    let ids: Vec<&str> = users.iter().map(|u| u.id.as_str()).collect();
    println!("online: {:?}", ids);
});
```

Fires once at register, then on every `presence_state` +
`presence_diff`. Metas carry per-connection metadata; unknown
fields land in `meta.extras`.

## errors

One `Error` type with an `ErrorKind` enum for matching:

```rust
use hela::ErrorKind;

match chat.publish(req).await {
    Ok(_) => {}
    Err(e) => match e.kind() {
        ErrorKind::RateLimited { retry_after_ms } => {
            tokio::time::sleep(Duration::from_millis(*retry_after_ms as u64)).await;
        }
        ErrorKind::Unauthorized => { /* re-mint JWT */ }
        ErrorKind::Timeout { .. } => { /* retry or surface */ }
        kind => eprintln!("server error: {kind:?}"),
    },
}
```

## regions

```rust
hela::Region::Iad   // Ashburn, US East
hela::Region::Sjc   // San Jose, US West
hela::Region::Ams   // Amsterdam
hela::Region::Sin   // Singapore
hela::Region::Syd   // Sydney
hela::Region::Dev   // localhost

// dev against a local gateway:
hela::connect(Config {
    region: Region::Dev,
    endpoint: Some("http://localhost:4001".into()),
    token: Some(jwt),
    ..Default::default()
}).await?;
```

## what's inside

| file            | what it does                                       |
| --------------- | -------------------------------------------------- |
| `client.rs`     | `connect`, `Client`, `Region`, `Config`            |
| `channel.rs`    | `Channel::{join, publish, history, on_message, leave}` |
| `presence.rs`   | CRDT roster, `on_sync`                             |
| `rest.rs`       | REST client: `mint_token`, `publish`, `history`, `playground_token`, `playground_token_ephemeral` |
| `transport.rs`  | Phoenix Channel v2 socket (private)                |
| `errors.rs`     | `Error` + `ErrorKind`                              |
| `types.rs`      | Wire + REST types, `serde`-derived                 |

Types are hand-written; `tests/types.rs` round-trips real schema
payloads so any drift in `packages/schemas/` breaks the build.
Live-gateway integration lives in `tests/integration.rs`, gated
behind `HELA_LIVE=1`.

## license

AGPL-3.0-or-later. See [LICENSE](../../LICENSE) in the repo root.
