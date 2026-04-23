# apps/gateway

Phoenix 1.8 data plane. One Elixir release per region. Each release's
cluster is isolated unless a project opts into cross-region replication.

## Run locally

From the repo root:

```
make setup          # postgres in docker + deps + migrate for both elixir apps
make dev.gateway    # just this app
```

Or the old-school way:

```
docker run -d --name hela-pg \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=gateway_dev \
  -p 5432:5432 postgres:16-alpine

cd apps/gateway
mix deps.get
mix ecto.setup
mix phx.server
```

Listens on `:4001` in dev (control is on `:4000`).

## Public endpoints (no auth)

| Method | Path                              | Purpose                      |
| ------ | --------------------------------- | ---------------------------- |
| POST   | /playground/token                 | guest JWT for landing demos  |
| POST   | /playground/publish               | sandbox publish              |
| GET    | /playground/history/:channel      | sandbox history              |
| GET    | /cluster/snapshot                 | latest metrics snapshot      |
| GET    | /regions                          | region list + "you are on"   |
| GET    | /regions/:slug/ping               | region probe                 |
| WS     | /socket                           | the SDK socket               |

## Customer endpoints (`Authorization: Bearer hk_...`)

| Method | Path                                 |
| ------ | ------------------------------------ |
| POST   | /v1/tokens                           |
| GET    | /v1/channels/:channel/history        |
| POST   | /v1/channels/:channel/publish        |

## Internal endpoints (`x-hela-internal: <secret>`)

Called by the control plane, never by customers.

| Method | Path                                | Purpose                 |
| ------ | ----------------------------------- | ----------------------- |
| POST   | /_internal/projects                 | upsert project + JWK    |
| DELETE | /_internal/projects/:id             | delete project          |
| POST   | /_internal/api_keys                 | upsert API key          |
| POST   | /_internal/api_keys/:id/revoke      | revoke API key          |

## The hot path

```
client publish
  │
  ▼
Hela.Channels.publish/1
  ├─ Hela.ID.generate_bin/0         UUIDv7
  ├─ Hela.Projects.tier/1           lookup tier for quota cap
  ├─ Hela.Quota.bump_messages/2     ETS counter + over_quota flag
  ├─ Hela.Chat.Cache.put/1          ordered_set ETS insert_new
  ├─ PubSub.broadcast!              region channel topic
  ├─ PubSub.broadcast!("cache:sync")peer ETS mirror
  ├─ Hela.Latency.observe(:broadcast, ...)
  └─ Hela.Chat.Pipeline.push/2      Broadway batcher
```

## Directory

```
lib/
├── hela.ex
├── hela/
│   ├── application.ex
│   ├── repo.ex
│   ├── release.ex           migrate task for the prod release
│   ├── id.ex                UUIDv7
│   ├── latency.ex           log-bucket histograms
│   ├── metrics.ex           per-node sampler
│   ├── quota.ex             per-project caps
│   ├── presence.ex
│   ├── channels.ex          public publish/history API
│   ├── projects.ex          cached mirror of control's project rows
│   ├── api_keys.ex          cached mirror of control's API-key rows
│   ├── chat/
│   │   ├── message.ex
│   │   ├── cache.ex         ETS ring buffer
│   │   └── pipeline.ex      Broadway batcher
│   └── auth/
│       ├── jwt.ex           grant verification
│       └── playground.ex    HS256 guest tokens
└── hela_web/
    ├── endpoint.ex
    ├── router.ex
    ├── channels/            UserSocket, ProjectChannel, MetricsChannel
    ├── controllers/         Playground, Cluster, Tokens, Channels, Region, Page, Internal
    └── plugs/
        ├── api_key_auth.ex
        └── internal_auth.ex
```
