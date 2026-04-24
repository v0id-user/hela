# hela

**Managed real-time infrastructure on BEAM.** Regional clusters, sub-100ms
channels/presence/history, flat monthly pricing. No per-message billing.

> pick a region, get sub-100ms channels, presence, and history. flat monthly
> pricing, no per-message billing.

This repo is the whole thing: the data plane, the control plane, the SDK,
the marketing site, and the customer dashboard — one monorepo, four
independently deployable apps.

```
hela/
├── apps/
│   ├── gateway/      Elixir · the realtime data plane (per-region Fly app)
│   ├── control/      Elixir · signup, billing, project CRUD, Stripe webhook
│   ├── web/          React · hela.dev — landing page + live playground
│   └── app/          React · app.hela.dev — customer dashboard
├── packages/
│   ├── schemas/      JSON Schema + OpenAPI — single source of truth
│   ├── sdk-gen/      codegen: schemas → SDK type modules
│   ├── sdk-js/       @hela/sdk — the published TypeScript SDK
│   ├── sdk-types/    @hela/sdk-types — wire-format types, dependency-free
│   ├── sdk-py/       hela (PyPI) — async Python SDK, Pydantic v2
│   ├── sdk-go/       hela-go — Go SDK
│   ├── sdk-rs/       hela (crates.io) — Rust SDK, tokio
│   └── ui/           @hela/ui — shared design system (silver on black)
├── infra/
│   ├── fly/          per-region gateway fly.toml + control/web/app configs
│   └── terraform/    Fly apps + Stripe products/prices
├── docs/             architecture notes, runbooks
├── docker-compose.yml  local dev (postgres + gateway + control + mailpit)
└── Makefile          one-liners for everyday work
```

## Quick start (local)

```
make setup       # postgres in docker, elixir deps, db migrate, bun install
make dev         # runs all 4 apps (concurrently, one terminal)
```

You get:

| app         | url                    | what it is                    |
| ----------- | ---------------------- | ----------------------------- |
| control     | http://localhost:4000  | REST API for signup/projects  |
| gateway     | http://localhost:4001  | the realtime cluster (WS + REST) |
| web         | http://localhost:5173  | the marketing site            |
| app         | http://localhost:5174  | the customer dashboard        |
| mailpit     | http://localhost:8025  | outbound email preview        |

Stripe webhooks in dev:

```
make stripe.listen   # forwards to http://localhost:4000/webhooks/stripe
```

## The four apps, in one paragraph each

**gateway** is the data plane. Phoenix 1.8 + Bandit, Channels + Presence
+ PubSub, ETS ring buffers per (project, channel), Broadway batching into
a per-region Postgres. `dns_cluster` meshes replicas within a region over
IPv6. One Fly app per region. Stateless except for ETS. Owns the `/socket`
WebSocket surface, the public `/playground/*` endpoints, and a
`/_internal/*` surface that the control plane pushes project + API-key
state to.

**control** is the control plane. Accounts, projects, API keys, Stripe
customer + subscription management, JWT public-key registration. Single
global deployment in iad. Knows about each region's gateway URL and
fans out project upserts via `x-hela-internal` signed POSTs so the data
plane's local mirror stays fresh without cross-region BEAM clustering.

**web** is the marketing site. Every demo on the page hits a real gateway:
hero has a live `hello:world` channel, the five primitive demos each target
a sandboxed `proj_public` project, the region selector opens fresh
sockets. Also hosts `/how` (architecture, inline SVG diagrams) and
`/dashboard` (live state of the public gateway, same panels a customer
gets for their project).

**app** is the customer dashboard. List/create projects, pick a region,
register a JWK, rotate API keys, view billing and usage. Talks to control
for state, talks to whatever gateway region their project is in for live
metrics.

## The five primitives

Everything the product does distils to these. Each has a module in the
gateway and a matching demo on the landing page:

1. **channels** — publish/subscribe on a named topic, all in-region.
   `Hela.Channels.publish/1`.
2. **presence** — CRDT-replicated per-channel roster.
   `Phoenix.Presence` via `Hela.Presence`.
3. **history** — last N messages per channel in ETS, cursor-paginated
   back to Postgres. `Hela.Channels.history/4`.
4. **sequencing** — UUIDv7 on every message, same id everywhere.
   `Hela.ID`.
5. **auth** — short-lived JWT grants verified against customer-registered
   JWKs. `Hela.Auth.JWT`, playground HS256 via `Hela.Auth.Playground`.

## Tenancy + billing shape

- **account** — one per signup, one Stripe customer.
- **project** — the billable unit, one Stripe subscription item. Fixed
  region, fixed JWK. Different projects on the same account can be on
  different tiers.
- **channel** — runtime only, namespaced by project. Topic is
  `chan:<project_id>:<channel_name>`; the JWT's `pid` claim is enforced
  against the topic on every join.

Tier caps in `packages/sdk-types` and `Hela.Quota`. Monthly messages over
the tier cap are billed as overage at $0.50 per million. Connection caps
are hard.

## Pricing

| Tier        | $/mo    | Connections | Messages/mo | Regions             | History  | SLA    |
| ----------- | ------- | ----------- | ----------- | ------------------- | -------- | ------ |
| Free        | $0      | 100         | 1M          | 1                   | 1k msgs  | none   |
| Starter     | $19     | 1,000       | 10M         | 1                   | 10k msgs | none   |
| Growth      | $99     | 10,000      | 100M        | 1                   | 100k msgs| 99.9%  |
| Scale       | $499    | 100,000     | 1B          | up to 3, replicated | 1M msgs  | 99.95% |
| Enterprise  | contact | custom      | custom      | all                 | custom   | 99.99% |

## Deploy

**Currently deployed on Railway.** Live URLs:

- web:     https://web-production-f24fc.up.railway.app
- app:     https://app-production-1716a.up.railway.app
- gateway: https://gateway-production-bfdf.up.railway.app
- control: https://control-production-059e.up.railway.app

One `hela` Railway project, 5 services (postgres, gateway, control,
web, app). Polar sandbox for billing. CI/CD auto-deploys on push to
main via `.github/workflows/ci.yml` — tests run first, then per-service
`railway up` with a scoped `RAILWAY_TOKEN` secret.

### CI flow

```
push to main
  │
  ├─ test-gateway (mix compile+test against ephemeral PG)
  ├─ test-control (ditto)
  └─ test-js      (bun install + build SDK + build web/app)
              │
              └─→ deploy-control ─┬─→ deploy-gateway
                                   ├─→ deploy-app
                                   └─→ deploy-web
```

### Environments

Two GitHub environments, each with its own `RAILWAY_TOKEN` scoped to a
matching Railway environment:

| GitHub env   | Railway env  | Triggers                    | Review required |
| ------------ | ------------ | --------------------------- | --------------- |
| `dev`        | `dev`        | PRs + non-main branch pushes | no              |
| `production` | `production` | push to `main`              | yes             |

PRs auto-deploy a preview to the Railway `dev` environment so the smoke
test runs against the exact commit. Merging to `main` kicks off a
production rollout that pauses for a reviewer's ack before each of the
four services rolls.

Each deploy job has a `concurrency:` group scoped by environment, so
overlapping pushes to dev never race a production rollout.

### Platform-agnostic

The Dockerfiles are vanilla. Railway is the current target; Fly.io
configs are in `infra/fly/` for when BEAM clustering over IPv6 +
multi-region is worth the move. `packages/sdk-types.REGIONS` and the
SDK don't assume a host — swap `dns_cluster` for `libcluster` with a
different strategy and the same images run on AWS, Hetzner, Kubernetes,
wherever.

## SDKs

Four languages, one wire protocol. All four type modules are
generated from `packages/schemas/` via `make sdk.gen`; transport and
the domain API are hand-written per language. The recipe for adding a
fifth is in [`docs/sdk/adding-a-language.md`](docs/sdk/adding-a-language.md).

| package            | lang       | registry                  | runtime                      |
| ------------------ | ---------- | ------------------------- | ---------------------------- |
| `@hela/sdk`        | TypeScript | npm                       | browser + Node (phoenix.js)  |
| `hela`             | Python     | PyPI                      | asyncio (`websockets` + `httpx`) |
| `hela-go`          | Go         | `go install`              | `coder/websocket`            |
| `hela` (crate)     | Rust       | crates.io                 | `tokio-tungstenite` + `reqwest` |

Docs: [`docs/sdk/`](docs/sdk/).

## Contributing

Read [`CLAUDE.md`](CLAUDE.md) first — it's the rule set for every
agentic or human contributor. Key points:

- **Small, focused commits.** One logical change per commit.
- **Schemas are the source of truth.** `_generated/` modules are
  never hand-edited; run `make sdk.gen`.
- **Subject lines match `^[A-Za-z0-9 ,:]{4,72}$`.** Enforced by
  commit-msg hook + CI. Conventional-Commit prefixes allowed;
  parens and hyphens aren't.
- **`lefthook install` once** — pre-commit runs format, lint, and
  tests for the languages you touched.

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the full guide.

## License

[AGPL-3.0-or-later](LICENSE). If you run a modified version of hela as a
public service, the AGPL requires you to make your modifications
available to your users. This is deliberate — the point is that the
backend is copyleft so the community benefits from anyone's
improvements, even if those improvements only ship as a hosted service.

If the AGPL isn't workable for your use case and you want a commercial
license, email hey@v0id.me.
