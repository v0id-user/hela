# pitfalls

Sharp edges that have either bitten us or are likely to. Read
before changing the area in question.

## deploy and infra

### Railway uploads respect `.gitignore`
- `dist/` is in the repo-root `.gitignore`. `railway up` uses
  the repo's gitignore by default, which means a freshly built
  vite output is dropped from the upload silently. Railway then
  serves a cached older Docker layer.
- The fix is `apps/web/.railwayignore` and
  `apps/app/.railwayignore`, each of which re-includes `dist/`
  with `!dist` and `!dist/**`.
- The CI `/version.commit` gate is the tripwire if this
  regresses.

### `railway redeploy` does not pull new config
- The CLI verb redeploys *the prior deployment*, not the *current
  configuration*. If you changed `source.image`, env vars, or
  attached a volume via API, you need a fresh deploy. Trigger via
  the GraphQL `serviceInstanceDeployV2(serviceId, environmentId)`
  mutation, capture the returned deployment id, and watch that
  specific id.

### Postgres image bumps with attached volumes
- If you attach an empty volume to a service whose image has not
  yet been bumped, the running image will initdb the volume in
  its layout. A subsequent image bump can hit
  `database files are incompatible with server`. This bit us on
  the PG16 to PG18 cutover.
- Order of operations: update `source.image` first, *then*
  attach the volume. Or attach the volume to a never-deployed
  service.

### Railway volumes mount as root, postgres runs as uid 999
- For `postgres:18-alpine`, mount the volume at
  `/var/lib/postgresql` and keep `PGDATA` on the versioned default
  path, e.g. `/var/lib/postgresql/18/docker`.
- Setting `RAILWAY_RUN_UID=0` also works but runs the container
  as root, which we avoid.

### Alpine has no liburing
- The `postgres:18-alpine` image is built without `--with-liburing`.
  `io_method=io_uring` will refuse to start. Use `io_method=worker`
  on Alpine. To get io_uring, switch to `postgres:18-bookworm` or
  `postgres:18-trixie`.

## gateway

### `RELEASE_NODE` host part is a label, not an address
- This repo has no `libcluster`, no `Node.connect`, no
  `dns_cluster` running today. The host part of `RELEASE_NODE` is
  a legibility label for observability.
- Prefer a readable hostname (`RAILWAY_PRIVATE_DOMAIN`) over an
  IP. If clustering ever lands, this needs to swap to a routable
  IP because Erlang distribution needs a real address.

### `/health` does not exercise the DB
- `/health` returns a static `ok\n`. Postgrex pool errors will
  not show up there, and a stuck pool will silently log nothing
  for minutes. To prove the DB is reachable, hit `/version`,
  which forces the release-script execution path on every deploy.

### Per-IP playground rate limit conflicts with multi-client landings
- The marketing site mounts two clients on first paint (hero
  ephemeral + demo non-ephemeral, different `sub` claims, both
  hitting `/playground/token`). The per-IP rate limit must be at
  least 2/sec to absorb that without 429s. Current setting is
  5/sec, 120/hour in
  `apps/gateway/lib/hela/playground_limiter.ex`.
- Tightening the limit again will fail the
  `sdk-js · e2e playground` job's `rateLimited.toEqual([])`
  assertion. That is intentional.

### Ephemeral JWT branching is everywhere
- `claims["ephemeral"]` is checked in
  `apps/gateway/lib/hela_web/channels/project_channel.ex` for
  join and `handle_in("history", ...)`, and in
  `apps/gateway/lib/hela/channels.ex` `do_publish/2` for cache
  and pipeline skip. If you add a new branch in the publish path,
  it needs the same flag check.

## SDKs

### Async token getter must be awaited
- Several SDK transports accept a `token` or `getToken` value.
  Passing an `async` function and reading the resulting Promise
  as if it were a string puts `[object Promise]` in the URL,
  which the gateway 401s.
- Always await before using.

### Web app singleton tokens go stale
- `apps/web/src/lib/hela.ts` keeps a `demoTokenState` and a
  `heroTokenState` singleton. `needsTokenRefresh` checks
  `expiresAtMs - TOKEN_REFRESH_LEEWAY_MS`. If you add a new
  client surface, mirror this pattern; do not add a third
  un-refreshed token state.

### Two clients on one page is normal
- Hero (ephemeral) and demo primitives (non-ephemeral) each open
  their own WebSocket. Two `wss://...gateway.../socket/websocket`
  connections is the expected count. The Playwright assertion is
  `≥ 2`, not `== 1`.

## tests and CI

### Chromium auto-logs every non-2xx as a console error
- `Failed to load resource: the server responded with a status
  of N` shows up in `consoleErrors`. Do not filter these to
  paper over a real failure. Instead, use `page.on("response", ...)`
  to capture the specific status against the specific URL and
  assert on that.
- The session that filtered 429s out of `consoleErrors` shipped
  a real bug to production.

### `consoleErrors.toEqual([])` is an honest assertion
- It says: nothing on the page logged an error during this run.
  Weakening it (filter, allowlist) is almost always wrong. If
  the test fails on a real condition, fix the condition.

### Schema drift is automated, do not hand-edit `_generated/`
- `make sdk.gen` regenerates Python and TypeScript wire types.
  CI runs `git diff --exit-code` after regenerating; mismatches
  fail the PR.
- A schema change requires the change in `packages/schemas/`
  *and* the regenerated code in `packages/sdk-py/src/hela/_generated/`
  + `packages/sdk-types/src/` in the same commit.

## sweeps

### `rg` from repo root is the only honest sweep
- Past `sed` runs over a narrow file set missed `stripe_*` in
  TS types, in component-level UI strings, in the legacy alias
  `ensure_stripe_customer/1`, and in `STRIPE_SECRET_KEY` in
  docker-compose. They missed `hela.dev` in package manifests,
  in OpenAPI comments, in SVG comments, and in `infra/fly/*.toml`.
- Before claiming a sweep is done, run `rg <pattern> .` from the
  repo root. Anything that comes back is unswept.

### "Working" UI text is not the same as "correct" UI text
- The dashboard pages had Stripe artifacts (panel titles, button
  labels, type names like `stripe_customer_id`) for sessions
  even after the billing module was migrated to Polar. UI text
  follows code in importance, not below it.

## branding and naming

### `hela.dev` is not owned by the project
- Do not reference `hela.dev` in code, docs, or generated assets.
  Use the GitHub repo URL (`github.com/v0id-user/hela`) for
  homepages, the Railway URLs for live surfaces, and `*.fly.dev`
  for Fly secondary documentation. If a real domain ever lands,
  this rule changes.

### Test data domains
- Synthetic identifiers that land in an external service (Polar
  customer email, OAuth callback URL, webhook URL) must be on a
  domain the project owner controls.
- **Owned today:** `v0id.me`. Use `@v0id.me` for any test-only
  email that must pass real-domain validation (Polar's customer
  validator rejects RFC 2606 special-use TLDs like `.test`,
  `.example`, `.invalid`, `.localhost`).
- **Do not use** `@hela.dev` (we don't own it — see above),
  `@gmail.com` or other public mail hosts (third-party — risks
  collision with a real account), or any "looks unique enough"
  domain.
- Pattern: `<purpose>-<timestamp><random>@v0id.me`, e.g.
  `dev-it-1777102000@v0id.me`. The timestamp prevents inter-run
  collisions; the purpose prefix lets you find the test rows
  later for cleanup.
- See `docs/dev/mistakes.md` "Reused @hela.dev for test emails"
  for the incident behind this rule.

### Fly is documented as secondary, not active
- The toml files under `infra/fly/` exist as a runnable secondary
  path. They reference `*.fly.dev` placeholders. Do not
  introduce a third deploy target without owner agreement.

## process

### "All green" without a list hides regressions
- `sdk-js · e2e playground` was green when the page was visibly
  broken (429 retry storm), because the test filtered the 429.
  CI green is necessary, not sufficient.
- A closeout summary lists, by name, the specific jobs that
  passed and the specific surfaces that are not yet behind the
  commit-match deploy gate.

### Vague summaries hide failure
- "Mostly green" and "should be working now" are smells. Either
  it works (with proof) or it does not (with the failing line).
  Nothing in between.
