# hela-go

Go SDK for [hela](https://hela.dev) — managed real-time on BEAM.
Go 1.23+, context-aware, depends only on [`coder/websocket`](https://github.com/coder/websocket)
and the stdlib.

```sh
go get github.com/v0id-user/hela/packages/sdk-go
```

## 60 seconds

```go
package main

import (
    "context"
    "fmt"

    hela "github.com/v0id-user/hela/packages/sdk-go"
)

func main() {
    ctx := context.Background()
    client, err := hela.Connect(ctx, hela.Config{
        Region: hela.RegionIAD,
        Token:  myJWT,
    })
    if err != nil {
        panic(err)
    }
    defer client.Close()

    chat := client.Channel("chat:lobby")
    chat.OnMessage(func(m hela.Message) {
        fmt.Println(m.Author, m.Body)
    })

    if _, err := chat.Join(ctx, hela.JoinRequest{Nickname: "alice"}); err != nil {
        panic(err)
    }
    if _, err := chat.Publish(ctx, hela.PublishRequest{Body: "hello"}); err != nil {
        panic(err)
    }
}
```

## auth modes

- **Customer JWT** (normal path) — your backend signs a short-lived
  token and hands it to the user. Pass as `Token`.
- **Playground token** (landing-page demos) — 5-minute guest token
  scoped to the public sandbox project. Pass as `PlaygroundToken`.
  Use `PlaygroundTokenWithOpts{Ephemeral: true}` when you need a
  broadcast-only guest JWT (no join replay, no persistence).

Your backend mints tokens via `hela.REST`:

```go
rest := hela.NewREST("https://gateway-production-bfdf.up.railway.app", hela.RESTOptions{
    APIKey: os.Getenv("HELA_API_KEY"),
})
resp, err := rest.MintToken(ctx, hela.TokenRequest{
    Sub:        user.ID,
    Chans:      [][]string{{"read", "chat:lobby"}, {"write", "chat:lobby"}},
    TTLSeconds: 300,
})
// TokenRequest.Ephemeral: set true for broadcast-only HS256 grants from /v1/tokens.
```

## presence

Every channel has a CRDT-backed roster:

```go
chat.Presence.OnSync(func(users []hela.PresenceEntry) {
    ids := make([]string, 0, len(users))
    for _, u := range users {
        ids = append(ids, u.ID)
    }
    fmt.Println("online:", ids)
})
```

The callback fires once at registration (with the current snapshot)
and on every subsequent `presence_state` + merged `presence_diff`.

## rate limiting

Your project's tier caps publishes at N/second. Crossing that returns
`*RateLimitedError` with a retry hint:

```go
var rl *hela.RateLimitedError
if _, err := chat.Publish(ctx, hela.PublishRequest{Body: "burst"}); errors.As(err, &rl) {
    time.Sleep(time.Duration(rl.RetryAfterMs) * time.Millisecond)
    _, _ = chat.Publish(ctx, hela.PublishRequest{Body: "burst"})
}
```

## regions

```go
hela.Connect(ctx, hela.Config{Region: hela.RegionIAD, Token: jwt})
hela.Connect(ctx, hela.Config{Region: hela.RegionDEV, Endpoint: "http://localhost:4001", Token: jwt})
```

Hosted: `RegionIAD`, `RegionSJC`, `RegionFRA`, `RegionSIN`, `RegionSYD`.
`RegionDEV` + `Endpoint` for local gateways.

## what's inside

| file           | what it does                                       |
| -------------- | -------------------------------------------------- |
| `client.go`    | `Connect`, `Client`, region map                    |
| `channel.go`   | `Channel.Join/Publish/History/OnMessage/Leave`     |
| `presence.go`  | CRDT roster + `OnSync`                             |
| `rest.go`      | REST client for server-side use                    |
| `transport.go` | Phoenix Channel v2 socket (private)                |
| `errors.go`    | `UnauthorizedError`, `RateLimitedError`, `TimeoutError`, `ServerError` — all wrap `ErrHela` |
| `types.go`     | Wire + REST types, `json`-tagged to match schemas  |

Types are hand-written but validated in `types_test.go` against real
schema payloads. Live-gateway integration lives in
`integration_test.go`, gated behind `HELA_LIVE=1`.

## license

AGPL-3.0-or-later. See [LICENSE](../../LICENSE) in the repo root.
