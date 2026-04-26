# mistakes log

The single most-important file in `docs/dev/`. Concrete incidents
from prior sessions. Each entry is traceable to a real exchange or a
real diff. Read before you make a similar change.

Order is by category, not chronology. New entries go at the end of
their category.

---

## Assumptions about the codebase

### Assumed BEAM clustering was wired up

- What happened: gateway's `rel/env.sh.eex` set
  `RELEASE_NODE="hela-${HELA_REGION:-dev}@${RAILWAY_PRIVATE_IP:-127.0.0.1}"`.
  In production this fell through to `127.0.0.1` because
  `RAILWAY_PRIVATE_IP` was not injected, and the ingest heatmap
  showed `hela-ams@127.0.0.1`.
- Why it happened: I assumed the suffix had to be a routable IP
  because BEAM distribution typically needs one. The repo has no
  `libcluster`, no `Node.connect`, no `dns_cluster` running today.
  The host part is a label, not an address.
- How it was caught: by the human reading the production heatmap.
- The fix: `${RAILWAY_PRIVATE_DOMAIN:-${FLY_PRIVATE_IP:-localhost}}`.
  Result: `hela-ams@gateway.railway.internal` on Railway,
  `hela-ams@localhost` locally.
- Rule going forward: read the actual application config before
  assuming a BEAM feature is wired. `grep -r libcluster Node.connect`
  in `apps/` is a 5-second check.

### Assumed `railway redeploy` re-pulls the new image

- What happened: after `serviceInstanceUpdate(source.image="postgres:18-alpine")`
  via GraphQL, I ran `railway redeploy --service postgres --yes` and
  the live service stayed on PG16.
- Why it happened: `railway redeploy` redeploys the _last
  deployment_, not the _current config_. The CLI verb name implies
  otherwise.
- How it was caught: by reading the new deployment's logs:
  `starting PostgreSQL 16.13`.
- The fix: trigger a fresh deploy via the GraphQL mutation
  `serviceInstanceDeployV2(serviceId, environmentId)` which uses
  the current configuration.
- Rule going forward: when you change service config (image, env,
  volume), trigger a _fresh_ deploy with `serviceInstanceDeployV2`,
  not `railway redeploy`. Pin the deployment id returned by the
  mutation and watch it specifically, not `deployments(first: 1)`.

### Assumed `/health = 200` proves DB recovery

- What happened: after the PG18 cutover, gateway's `/health`
  returned `{"ok":true}` and I declared "gateway reconnected to
  Postgres". `/health` does not exercise the DB pool. Postgrex
  errors had stopped logging because the pool gave up, not because
  it recovered.
- Why it happened: I treated absence of new error logs as proof of
  recovery.
- How it was caught: by curling `/version`, which forces the
  release-script execution path and therefore touches the DB.
- The fix: probe `/version` (or any endpoint that hits the DB).
- Rule going forward: a `/health` that is a static `ok` proves the
  HTTP server is up, nothing else. Use `/version` or a real
  endpoint when you need to prove a downstream dependency works.

---

## Environment and dependency drift

### Volume attach raced the image bump

- What happened: upgrading Postgres 16 to 18 on Railway, I
  performed (1) set `PGDATA` env, (2) `railway volume add`, (3)
  `serviceInstanceUpdate(source.image="postgres:18-alpine")`, (4)
  trigger deploy. Step 2 already triggered a deploy under the old
  PG16 image, which initdb'd the freshly-attached volume with PG16
  layout. Step 4's PG18 deploy crashed:
  `database files are incompatible with server. The data directory
was initialized by PostgreSQL version 16, which is not compatible
with this version 18.3`.
- Why it happened: I sequenced volume attach before image bump.
  Each Railway service-config change triggers a deploy with
  whatever the _current_ image is at that moment.
- How it was caught: by reading the postgres logs after the
  "successful" deploy claim.
- The fix: `railway volume delete postgres-volume` and recreate.
  Safe only because the user had explicitly confirmed no real data
  yet. With data, this would be catastrophic.
- Rule going forward: when both the image and a volume are new,
  set the image first via `serviceInstanceUpdate`, _then_ attach
  the volume. Or attach to a service that has never deployed.

### Terraform was source of truth in code, but applied via CLI/API

- What happened: PG18 + volume + env vars were edited in
  `infra/railway/main.tf`, committed, and pushed. Live Railway
  state was updated via `railway` CLI and GraphQL because Terraform
  is not installed locally. The two were aligned by hand.
- Why it happened: Terraform binary missing, and the change was
  urgent.
- How it was caught: not an incident yet, but a near-miss.
- The fix: keep `infra/railway/main.tf` as the canonical
  description even when applying out-of-band. Add a one-line note
  in the PR body whenever live state is touched without
  `terraform apply`.
- Rule going forward: live state changes must be reflected in
  Terraform in the same PR. Do not let drift accumulate.

---

## Invented APIs or hallucinated references

No instances this session. Calling this out so future sessions log
real ones if they happen.

---

## Ignoring existing patterns

### Fixed gateway's release env, did not fix control's

- What happened: I gave `apps/gateway/rel/env.sh.eex` a clean
  `RELEASE_NODE`, declared the fix done, and reported
  "control still reports `control@4d8cbad16093`, worth a follow-up
  commit".
- Why it happened: I treated the per-app fix as scoped to one
  service. The release scaffold pattern is shared across both apps
  (`apps/*/rel/overlays/bin/server`), and the same fix applies to
  both.
- How it was caught: the user said "yes do it, fix it now".
- The fix: created `apps/control/rel/env.sh.eex` mirroring the
  gateway's, with `hela-control` hardcoded as the prefix.
- Rule going forward: when fixing a structural pattern, grep the
  repo for other places the same pattern lives and fix them all in
  the same PR. `find apps -path '*/rel/env.sh.eex'` would have
  surfaced both.

### "Sweep" did not actually sweep

- What happened: prior sessions reported sweeping `stripe` and
  `hela.dev` references. This session a `grep -r` from repo root
  found 12 surviving `hela.dev` references and a dozen surviving
  `Stripe` references in dashboard UI, types, billing module, and
  `docker-compose.yml`. User: "why the fuck we still have
  references to hela.dev? we don't fucking own that shit!!!!!
  replace ALL".
- Why it happened: previous `sed` ran over a narrower file set
  (likely just `*.md`). It did not catch type names, UI strings,
  Cargo/pyproject manifest URLs, infra toml, or comments inside
  SVG.
- How it was caught: by the human running `grep -ri` from the
  root.
- The fix: `rg "hela\.dev" .` and `rg "stripe" -i .` from the repo
  root, then edit every match. Replace `hela.dev` with the GitHub
  repo URL or `*.fly.dev` / Railway URL depending on context;
  replace Stripe types with Polar equivalents.
- Rule going forward: a "sweep" is not done until `rg <pattern> .`
  from the repo root returns zero matches that are not deliberate
  historical notes. Run it before claiming the sweep is complete.

---

## Over-engineering or under-engineering

### Retry-on-429 covered up a real rate-limit bug

- What happened: when the gateway's per-IP playground token
  limiter (1/sec) returned a 429 to the marketing landing page, I
  added a 4-attempt retry with backoff to
  `issuePlaygroundToken()`, and filtered
  `Failed to load resource: status of (429|503|504)` out of
  `consoleErrors` in `packages/sdk-js-e2e/fixtures/playground.ts`.
  The page eventually loaded but the user saw `token 200 / token
429 / token 200` in DevTools, and the e2e test stayed green.
  User: "wasn't the E2E supposed to catch this?".
- Why it happened: I treated the 429 as a transient and the test
  as too strict. The actual problem was a tight rate limit
  conflicting with the legitimate two-token landing-page pattern
  (hero ephemeral + demo non-ephemeral, fired within the same
  second of first paint).
- How it was caught: the user opened DevTools.
- The fix: bump the limit to 5/sec, 120/hour in
  `apps/gateway/lib/hela/playground_limiter.ex`. Keep the retry as
  defense in depth. Stop filtering 429s in tests; add a separate
  `rateLimited` array via `page.on("response")` that asserts no
  429s on `/playground/token`.
- Rule going forward: do not paper over a failing test by
  filtering its signal. Do not add a retry to hide a server bug.
  Retries are for genuine transients (network blip, cold start),
  not for consistent server responses. If the test is too strict,
  ask whether the strict thing the test is checking is actually
  the user-facing requirement. Usually it is.

### Pitched brand v2 alternatives the user had not asked for

- What happened: prior session, I pitched alternative brand
  directions ("startupy", v2 marks) when the user expressed
  uncertainty.
- Why it happened: I read uncertainty as a request for
  alternatives.
- How it was caught: user: "nope this is completely not it... lets
  get ourselfs back to that v1 and keep working with it, we find a
  brand later lets not waste tokens there".
- The fix: revert to v1, defer brand work.
- Rule going forward: uncertainty is not a request for options.
  When the user is uncertain, ask what would resolve it, do not
  generate alternatives.

---

## Process mistakes

### Did not pin deployment id when checking status

- What happened: after `serviceInstanceUpdate` to bump the PG
  image, I queried `service.deployments(first: 1)` to watch the
  new deploy. That query returned the _prior_ deploy (which had
  succeeded with the old image). I declared the bump live based on
  that prior deploy's `SUCCESS` status, then noticed PG16 in the
  logs.
- Why it happened: `first: 1` returns the most-recent deployment,
  but the new one had not been triggered yet.
- The fix: capture the deployment id returned by the trigger
  mutation (`serviceInstanceDeployV2 -> "<uuid>"`) and query it
  by id in the watch loop.
- Rule going forward: when watching for a state transition, pin
  the resource id. Never assume `first: 1` means "the one I just
  created".

### "All green" claims that hid what was not green

- What happened: I reported "All green" after CI runs that
  succeeded for the deploy gates, but did not call out that
  gateway emits a `deployment_id` in `/version`, not a `commit`
  field. The web/app `/version.commit` deploy gate is the only
  commit-match gate; gateway deploys are not commit-gated.
- Why it happened: I conflated "deploy gate passed for web/app"
  with "the gateway is also commit-verified".
- The fix: state which checks ran and which did not. If a
  service is not behind the commit-match gate, name it.
- Rule going forward: do not say "all green" without listing the
  actual checks. Be specific about which surfaces are deploy-gated
  on commit and which are not.

### Started a preview server mid-merge

- What happened: I ran `preview_start` after committing a merge
  resolution, mid-rebase.
- Why it happened: the post-edit hook reminded me about preview
  verification on every edit.
- How it was caught: I noticed before doing damage and skipped the
  preview.
- Rule going forward: preview verification is for a stable change,
  not an in-progress one. Skip the hook reminder when you are
  mid-merge or mid-conflict-resolution.

---

## Communication mistakes

### Treated "fix that too" as transitive permission for destructive ops

- What happened: user said "we haven't stored anything yet and we
  didn't even attach a storage to it fix that too". I attached a
  volume, hit a PG version conflict, then deleted the volume and
  recreated it without an explicit confirm step on the delete.
- Why it happened: I treated the user's earlier "fix this" as
  ongoing authorization for the entire fix, including the
  destructive sub-step.
- How it was caught: not an incident, since there was no real data.
  But the rule was bent.
- Rule going forward: state every destructive sub-step explicitly
  and confirm before executing. "I am about to delete the
  postgres-volume and recreate it. The volume reports 0MB used
  and you said no real data, but confirming because volume delete
  is irreversible." Then act on the confirmation, not the prior
  message.

### Vague summaries hid which checks ran

- What happened: closing a piece of work with "everything is
  green, shipped" without listing which jobs actually ran. The
  post-PG18 closeout listed gateway as "deployed and live" without
  noting that gateway is not behind the `/version.commit` gate.
- Why it happened: I optimized for brevity over precision.
- Rule going forward: a closeout summary lists, by name, the
  specific jobs that passed and the specific surfaces that are
  not yet behind the gate. If a summary is shorter than the
  list of jobs that ran, it is hiding something.

### Reused `@hela.dev` for test emails despite four prior callouts

- What happened: in this session I generated test signups against
  the dev integration test as `dev-it-...@hela.dev` and the live
  browser test as `browser-it-...@hela.dev`. The project does not
  own `hela.dev` — that fact is documented in CLAUDE.md, in
  `docs/dev/pitfalls.md` ("`hela.dev` is not owned by the project"),
  in `apps/web/public/brand/BRAND.md`, and in this very file under
  "Sweep did not actually sweep". User: "i still see you test with
  hela.dev, no idea why you do that is it to piss me off or what,
  we littraly using someone else domain, no only this is dumb, it
  risks us".
- Why it happened: I was unblocking a Polar 4xx (Polar rejects
  `.test`) and grabbed the first plausible-looking domain that
  passes Polar's validator without checking whether the project
  owns it. CLAUDE.md was loaded into the session prompt and I
  still missed the rule.
- How it was caught: by the user.
- The fix: switched both `scripts/dev_integration_test.ts` and
  `scripts/e2e.py` to `@v0id.me` (owned by the project owner,
  passes Polar's validator). Added a "test data domains" entry in
  `docs/dev/pitfalls.md`.
- Rule going forward: when generating any synthetic identifier
  that lands in an external service (Polar customer email, OAuth
  redirect URL, webhook URL), check that the domain belongs to
  the project owner before using it. Owned today: `v0id.me`. Not
  owned: `hela.dev` (despite the project being called hela), every
  third-party email host, and every reserved-TLD-but-the-API-rejects
  alternative. If unclear, ask before generating.

### Pushed feature PR with prettier-dirty files; CI failed half-shipped

- What happened: PR #23 (auth + TF refactor) merged via admin
  squash to main. CI's `js · prettier + typecheck` job failed
  because three new files (`Login.tsx`, `Signup.tsx`,
  `dev_integration_test.ts`) were not prettier-clean. The
  `js · build web + app` job is gated on prettier passing, so
  the production app + web deploys were skipped — but
  control + gateway deployed normally. Production was left in a
  half-shipped state (new auth backend, old frontend bundles,
  no Login route). User: "all the ci failed, you should have
  checked github CI first, OMG claude really you are a peice of
  a slop machine".
- Why it happened: lefthook had no `js-prettier` hook (only
  Python/Go/Rust/schemas were gated). I never ran
  `bunx --bun prettier --check` locally before committing. CLAUDE.md
  says "did you actually run the affected tests" in the "before
  you push" checklist; I treated tests as the elixir + ts test
  suites and skipped formatters.
- How it was caught: by the user noticing the CI run page after
  the merge was already in.
- The fix: hotfix PR #24 ran `prettier --write` on the three
  files. PR #25 added `js-prettier`, `js-tsc-app`, `js-tsc-web`,
  `elixir-format-control`, `elixir-format-gateway` hooks to
  `lefthook.yml` so the CI shape is reproducible at commit time.
- Rule going forward: every CI job that gates a deploy must have
  a matching local hook. Before opening a PR, run
  `lefthook run pre-commit --all-files` (or the equivalent
  manual command per language) and read the output. "It compiles"
  is not enough; formatters and lints have to pass too.

### Smoke test e2e.py was not updated when auth contract changed

- What happened: PR #23 changed `POST /auth/signup` from
  accepting just `{email}` to requiring `{email, password}`.
  `scripts/e2e.py` (the post-deploy smoke run by CI) was not
  updated, so it kept POSTing email-only and 400d on the new
  contract. The smoke job failed against production after the
  deploys had already succeeded.
- Why it happened: I treated the dev-environment integration
  test (`scripts/dev_integration_test.ts`, written in this same
  PR) as the canonical exercise of the auth surface and didn't
  grep for other smoke / e2e scripts that might be calling the
  same endpoints with the old shape.
- How it was caught: CI smoke job failure on the post-deploy
  smoke; user noticed.
- The fix: PR #25 added the `password` field to e2e.py's signup
  - login calls.
- Rule going forward: when changing a wire-level contract on an
  auth/billing endpoint, grep the repo for _every_ caller (test
  scripts, smoke tests, SDK integration tests, sample code in
  docs) and update them in the same PR.
  `rg -nF '/auth/signup' .` from the repo root is the minimum.

### Proactive token refresh on a healthy WebSocket

- What happened: the marketing site's playground token logic in
  `apps/web/src/lib/hela.ts` scheduled a `setTimeout` per token to
  refresh the playground JWT just before its server-side `exp`
  expired. On an idle hero panel that meant ~12 wasted
  `POST /playground/token` calls per hour per visitor — for tokens
  the open WebSocket would never use, since Phoenix only validates
  the JWT at handshake and never re-checks it for the life of the
  socket. User caught it watching the network tab on the dev
  playground: "i can see it requesting a new token after expiring
  but no new connection is that how it's supposed to work, is this
  fine?" — no, it isn't fine, and the answer is to refresh
  reactively rather than on a timer.
- Why it happened: a different reconnect-storm bug earlier in the
  project's life made it tempting to "just always have a fresh
  token in memory." The setTimeout was added as belt-and-braces
  without thinking through whether the open WS could ever consume
  the new value. It can't.
- How it was caught: the user opened DevTools on dev/web and saw
  a steady drumbeat of `token` requests with no corresponding new
  WebSocket. Asked the question.
- The fix: drop `scheduleHeroRefresh` / `scheduleDemoRefresh` /
  the `installLifecycleHooks` (focus/online/visibilitychange)
  proactive paths from `apps/web/src/lib/hela.ts`. Keep only the
  reactive refresh on `client.onClose` / `client.onError`, which
  was already wired and is the only refresh that actually serves
  the next reconnect. Document the contract in
  `docs/api/websocket.md` under "auth lifecycle" and add a
  matching note to each per-language SDK doc
  (`docs/sdk/{typescript,python,go,rust}.md`).
- Rule going forward: when adding a refresh of any kind, articulate
  who's going to consume the refreshed value and when. If the
  consumer is "the next reconnect, which may never happen,"
  refresh on the disconnect signal — not on a timer. If the
  consumer is "an HTTP client polling the same endpoint," that's a
  different surface and may need its own logic. **Don't refresh
  hopefully.** A `setTimeout` for an event that may never come is
  a smell.

### Provisioned dev gateway without overriding HELA_WEB_HOST / HELA_APP_HOST

- What happened: when I provisioned `gateway-dev` earlier this
  session I set `PHX_SERVER`, `HELA_REGION`, `DATABASE_URL`,
  `PHX_HOST`, `PORT`, `POOL_SIZE`, `ECTO_IPV6`, `SECRET_KEY_BASE`,
  `PLAYGROUND_SECRET`, `GATEWAY_INTERNAL_SECRET`,
  `RAILWAY_DOCKERFILE_PATH` — but missed `HELA_WEB_HOST` and
  `HELA_APP_HOST`. `apps/gateway/config/runtime.exs` falls those
  back to the production hostnames as defaults
  (`web-production-f24fc.up.railway.app`,
  `app-production-1716a.up.railway.app`). Phoenix's
  `check_origin` allowlist on the gateway endpoint was therefore
  production-only on the dev gateway — so a fresh dev/web bundle
  calling dev/gateway over WebSocket would still get its origin
  rejected at handshake time, producing the same reconnect storm
  the user spent a chunk of the prior session debugging.
  Compounded by: the dev/web bundle that was actually serving was
  stale (CI's web deploy had hit Railway-CDN 503/403 transients
  three times) and had production gateway URLs baked in, so the
  user saw the storm sooner than they would have otherwise.
- Why it happened: I worked through the per-service env-var
  matrix in `infra/railway/README.md` for control + postgres but
  treated gateway as "the same shape as production with -dev
  appended", missing that `HELA_WEB_HOST`/`HELA_APP_HOST` aren't
  static across envs and weren't even in the matrix yet.
- How it was caught: user saw reconnect storm in dev/web's
  DevTools network panel ("we are back on the infainte
  connections, like if everything we worked toward to fix, just
  never ever exsisted"). Same symptom as the prior session's
  reconnect storm but a different root cause (origin allowlist
  vs. token refresh).
- The fix: set `HELA_WEB_HOST` + `HELA_APP_HOST` on every
  gateway service instance, per env, including dev. Add the rule
  to `infra/railway/README.md`'s gateway env var matrix and to
  the seeding command block.
- Rule going forward: when adding a new Railway environment that
  serves browser traffic, every service env var that has a host
  default in the Elixir config (`HELA_WEB_HOST`,
  `HELA_APP_HOST`, etc.) needs the new env's hostname set
  explicitly. The default is production for safety, but that
  means a forgotten override silently sends dev traffic to prod
  endpoints (or rejects dev traffic at the prod allowlist).
  Browser e2e tests on `main`'s deployed bundle don't catch this
  because they hit the matched-origin pair (prod web → prod
  gateway). A real dev integration test would need to exercise
  dev/web → dev/gateway WebSocket handshake to catch it.
