# architecture

Canonical notes for anyone new to the codebase. The live-rendered version
is at [hela.dev/how](https://hela.dev/how); this file is the written
source of record.

## Data plane / control plane split

Two Elixir apps, two Postgres databases.

### gateway (`apps/gateway`)

The only thing a customer's WebSocket ever talks to. Data plane, so
optimised for throughput and isolation.

- `Hela.Channels` — the public publish/subscribe/history surface
- `Hela.Chat.Cache` — per-(project, channel) ETS ring buffer
- `Hela.Chat.Pipeline` — Broadway batch writer into per-region Postgres
- `Hela.Presence` — `Phoenix.Presence` CRDT roster
- `Hela.Quota` — per-project counters, hot-path enforcement
- `Hela.Metrics` — per-node sampler → `metrics:live` PubSub topic
- `Hela.Latency` — log-bucketed histograms for the broadcast + persist spans
- `Hela.Projects` + `Hela.APIKeys` — **mirror** of control's canonical
  project/key state, populated via `/_internal/*` upserts
- `Hela.Auth.JWT` — verifies customer-signed grants against the JWK
  cached in `Hela.Projects`

Gateway never originates project rows. It reads from `projects_cache` and
`api_keys_cache`; control writes. This is the boundary.

### control (`apps/control`)

Global singleton. Slow path, so optimised for correctness.

- `Control.Accounts` — accounts, projects, API keys (canonical)
- `Control.Billing` — Stripe wrapper (Customer, Subscription,
  SubscriptionItem, webhook dispatch)
- `Control.Sync` — fans out project/key mutations to every gateway in the
  project's region over HTTP, with an `x-hela-internal` header secret

## The hot path (one publish, end to end)

```
client publish
  │
  ▼
Hela.Channels.publish/1
  ├─ Hela.ID.generate_bin/0        UUIDv7, 128 bits, time-ordered
  ├─ Hela.Quota.bump_messages/1    ETS counter, maybe flag over_quota
  ├─ Hela.Chat.Cache.put/1         ordered_set ETS, insert_new
  ├─ PubSub.broadcast!             region-wide channel topic
  ├─ PubSub.broadcast!("cache:sync")  peer ETS mirrors the row
  ├─ Hela.Latency.observe(:broadcast, ...)
  └─ Hela.Chat.Pipeline.push/2     Broadway: up to 1000 rows / 200ms batch
```

Every step is non-blocking. A Postgres stall can't halt broadcasts; it
grows the Broadway queue, which is visible on the dashboard.

## Cluster topology

Within one region, N gateway machines auto-mesh via `dns_cluster`
resolving `top1.nearest.of.hela-gateway-<region>.internal` over Fly's
IPv6. `Phoenix.PubSub` rides that mesh. Presence is CRDT-replicated so
join/leave ordering is conflict-free across nodes.

Regions are **otherwise isolated** — no cross-region BEAM mesh. A
customer on Scale tier who enables multi-region gets a lightweight relay:
one subscriber per project per peer region re-publishes into its local
PubSub. UUIDv7 ids sort globally so merged histories stay in time order.

## Tenancy

```
account (1 signup, 1 stripe customer)
  └─ project (billable unit, owns api keys + region + JWK)
       └─ channel (runtime, `chan:<project_id>:<name>`)
```

Topic prefix, JWT `pid` claim, Ecto `where project_id = ?` on every
gateway query. Three layers of defence against cross-tenant access.

## SDK surface

Four client SDKs, all drawing types from
[`packages/schemas/`](../packages/schemas/) (JSON Schema draft-07 for
the WS surface, OpenAPI 3.1 for REST). Wire protocol version is
tracked in [`packages/schemas/VERSION`](../packages/schemas/VERSION);
bump the major on breaking change, minor on additive change.

- `packages/sdk-js/` — TypeScript, wraps phoenix.js
- `packages/sdk-py/` — Python asyncio, Pydantic v2
- `packages/sdk-go/` — Go, `coder/websocket`
- `packages/sdk-rs/` — Rust, tokio-tungstenite

Transport + domain API are hand-written per language (~300 lines
each). Type modules are generated. A drift guard in CI regenerates
and diffs so a schema change that forgets to `make sdk.gen` fails
fast. See [`docs/sdk/adding-a-language.md`](./sdk/adding-a-language.md)
for the recipe.

## Why we don't do X

- **Edge everywhere.** Five regions is enough for sub-100ms over most of
  the internet. Cloudflare Durable Objects is the right tool for 300-POP
  sub-50ms; we're not that.
- **Scale to zero.** Cold-starting a WebSocket backend is bad UX.
  `min_machines_running = 2` per region, always.
- **Per-message billing.** Creates adversarial incentives between us and
  the customer. Flat caps + overage for the top 1% of traffic is simpler
  for both sides.
