# Go SDK

`hela-go` — context-aware, small surface, depends only on
[`coder/websocket`](https://github.com/coder/websocket) and stdlib.
Go 1.23+.

Source: [`packages/sdk-go/`](../../packages/sdk-go/).

## install

```sh
go get github.com/v0id-user/hela/packages/sdk-go
```

Pin to a tagged release once we ship `sdk-go-v0.1.0`.

## the 60-second tour

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
    _, _ = chat.Publish(ctx, hela.PublishRequest{Body: "hello"})
}
```

## auth

```go
// customer JWT, minted by your backend
hela.Connect(ctx, hela.Config{Region: hela.RegionIAD, Token: jwt})

// playground (sandbox demos)
hela.Connect(ctx, hela.Config{Region: hela.RegionIAD, PlaygroundToken: guest})
```

Mint user JWTs and playground tokens via the REST client:

```go
rest := hela.NewREST("https://gateway-production-bfdf.up.railway.app", hela.RESTOptions{APIKey: apiKey})

guest, _ := rest.PlaygroundToken(ctx, "")
ephemeralGuest, _ := rest.PlaygroundTokenWithOpts(ctx, hela.PlaygroundTokenOpts{Ephemeral: true})
// Ephemeral playground JWTs are broadcast-only on the gateway (no join replay, no persistence).

resp, err := rest.MintToken(ctx, hela.TokenRequest{
    Sub:        user.ID,
    Chans:      [][]string{{"read", fmt.Sprintf("chat:room:%s", roomID)},
                           {"write", fmt.Sprintf("chat:room:%s", roomID)}},
    TTLSeconds: 300,
    Ephemeral:  false, // set true for broadcast-only HS256 grants from /v1/tokens
})
```

### token rotation and reconnect

The JWT is checked **once** at WebSocket handshake. After that the
gateway never re-validates the token for the life of the socket. If
your app rotates tokens, the new value is used the **next** time the
SDK reconnects, not on the open socket. Refresh reactively on
disconnect rather than on a timer — see
[`docs/api/websocket.md` § auth lifecycle](../api/websocket.md#auth-lifecycle).

## channels

```go
chat := client.Channel("chat:lobby")

reply, err := chat.Join(ctx, hela.JoinRequest{Nickname: "alice"})
// reply: Messages, Source, Region, Node

pub, err := chat.Publish(ctx, hela.PublishRequest{Body: "hi", Author: "alice"})
// pub: ID, Quota

page, err := chat.History(ctx, hela.HistoryRequest{Limit: 50})
// page: Source, Messages

chat.OnMessage(func(m hela.Message) { /* ... */ })

_ = chat.Leave(ctx)
```

All methods take `context.Context`. Pass one with a deadline if you
want fine-grained timeouts; otherwise the heartbeat + WS close
drives liveness.

## presence

```go
chat.Presence.OnSync(func(users []hela.PresenceEntry) {
    for _, u := range users {
        fmt.Println(u.ID, u.Metas[0].Region)
    }
})
```

Fires once at register, then on every `presence_state` +
`presence_diff`. Metas carry per-connection metadata; extras (unknown
fields) land in `Meta.Extras`.

## errors

Every typed error wraps the sentinel `hela.ErrHela`:

```go
_, err := chat.Publish(ctx, hela.PublishRequest{Body: "x"})

var rl *hela.RateLimitedError
var unauth *hela.UnauthorizedError
var to *hela.TimeoutError

switch {
case errors.As(err, &rl):
    time.Sleep(time.Duration(rl.RetryAfterMs) * time.Millisecond)
case errors.As(err, &unauth):
    // re-mint token
case errors.As(err, &to):
    // push didn't get a reply in the context's deadline
case errors.Is(err, hela.ErrHela):
    // any other SDK error
}
```

## REST client

```go
rest := hela.NewREST("https://gateway-production-bfdf.up.railway.app", hela.RESTOptions{APIKey: apiKey})

t, _   := rest.MintToken(ctx, hela.TokenRequest{Sub: "user-1", TTLSeconds: 300})
pub, _ := rest.Publish(ctx, "chat:lobby", hela.PublishRequest{Body: "hi"})
page,_ := rest.History(ctx, "chat:lobby", hela.HistoryRequest{Limit: 100})
guest, _ := rest.PlaygroundToken(ctx, "")
ephemeralGuest, _ := rest.PlaygroundTokenWithOpts(ctx, hela.PlaygroundTokenOpts{Ephemeral: true})
// guest.Token vs ephemeralGuest.Token → HelaConfig.PlaygroundToken
```

Bring your own `*http.Client` via `RESTOptions.HTTP` for retries,
metrics, or shared connection pools.

## regions

```go
const (
    hela.RegionIAD // Ashburn, US East
    hela.RegionSJC // San Jose, US West
    hela.RegionAMS // Amsterdam
    hela.RegionSIN // Singapore
    hela.RegionSYD // Sydney
    hela.RegionDEV // localhost
)

// dev against a local gateway:
hela.Connect(ctx, hela.Config{
    Region:   hela.RegionDEV,
    Endpoint: "http://localhost:4001",
    Token:    jwt,
})
```

## reference

| symbol                       | what                                            |
| ---------------------------- | ----------------------------------------------- |
| `Connect(ctx, cfg)`          | open a WS, return a `*Client`                   |
| `Client.Channel(name)`       | create a `*Channel` bound to this client        |
| `Channel.Join/Publish/...`   | domain verbs                                    |
| `Channel.Presence`           | CRDT roster with `OnSync`                       |
| `NewREST(base, opts)`        | REST client for server-side use                 |
| `PlaygroundTokenWithOpts`    | mint playground JWT with `Ephemeral` flag       |
| `ErrHela`                    | sentinel for `errors.Is` / `errors.As`          |
| `Message`, `PublishReply`, … | hand-written types matching `packages/schemas/` |

## internals

- Types are hand-written in `types.go`. The surface is small (~11
  types); a code generator produces uglier Go than we'd want.
  Drift is caught two ways:
  - `types_test.go` round-trips real payloads through every named
    struct, so a shape change in the gateway breaks the test.
  - `make sdk.gen` runs a Python drift checker that walks each
    wire schema's properties and confirms the corresponding
    `types.go` struct has a field with a matching `json:"<name>"`
    tag. If a schema gains a property and `types.go` does not,
    the check fails with a useful message naming the missing
    field, and CI's `schema · regenerate + diff` fails the PR.
- Transport (`transport.go`) speaks Phoenix Channel v2 directly. See
  [api/websocket](../api/websocket.md) for the wire format.
- Heartbeat interval is 30 seconds. Phoenix drops the socket at ~60;
  don't bump past 45.
- Live integration (`integration_test.go`) is gated by `HELA_LIVE=1`.
- Run tests: `go test ./...`. Run with race detection: `go test -race ./...`.
