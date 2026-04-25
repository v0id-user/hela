# code quality

The "works on my machine is not shipped" file. Each rule is one of:

- **(tooling)**, enforced by a script, lint, or CI gate.
- **(review)**, checked in code review.
- **(judgment)**, intentionally subjective, flagged so it does not
  hide.

## configuration

- No hardcoded paths, credentials, ports, or hostnames in
  application code. **(review)**. Production hostnames live in
  `infra/railway/main.tf`; local dev defaults live in
  `apps/<service>/config/dev.exs` and the SDK constants files.
- All runtime config goes through `apps/<service>/config/runtime.exs`
  (Elixir) or `process.env` reads at module top (TypeScript).
  **(review)**.
- Every env var the app reads is documented in
  `docs/dev/environment.md` with name, purpose, example,
  required/optional. **(review)**.
- Default values are conservative. The Postgres release env
  fallback chain is the canonical example: prefer
  `RAILWAY_PRIVATE_DOMAIN`, then `FLY_PRIVATE_IP`, then
  `localhost`. Never fall through to `127.0.0.1` as a "harmless"
  default; it propagates into observability and looks like a bug.
  **(review)**.

## error handling

- No silent failures. Every error path either returns a tagged
  error tuple, raises, or logs at `error` level with enough
  context to act on. **(review)**.
- For network calls to external services, retry only when the
  failure is genuinely transient (network blip, cold start). Do
  not retry on consistent server responses (4xx that the server
  will keep returning). **(review)**. The 429 retry incident is
  in `mistakes.md`.
- HTTP error responses include a JSON body with at least
  `{"error": "<code>"}`. The control plane and gateway already do
  this; new endpoints must match.
- Tagged tuples (`{:ok, _} | {:error, _}`) for Elixir return
  values. Bang functions raise. Do not mix the two on the same
  function name. **(review)**.

## dead code

- No commented-out code blocks committed to `main`. If you need
  to keep a snippet, put it in a comment with a justification
  starting with `# kept because: ...`. **(review)**.
- TODOs must include an owner and a date or condition:
  `# TODO(v0id, 2026-05-01): switch to libcluster once …`.
  Naked `# TODO` is treated as a code smell during review.
  **(review)**.
- Unused exports, types, and functions get removed in the same
  commit that removes the last caller. **(review)**.

## dependencies

- Pin to exact versions where the language supports it.
  `package.json` may use `^` for SDK code, but the workspace
  root and apps pin exact. `Cargo.toml` and `mix.exs` pin
  caret-style; `Cargo.lock` and `mix.lock` are committed.
  **(tooling)** via lockfile presence.
- Every new external dependency requires a one-line justification
  in the PR description: what it provides, why a stdlib option
  is not enough. **(review)**.
- No optional/peer dependencies that are actually required at
  runtime without a clear error if they are missing. **(review)**.

## side effects

- Module-level side effects are flagged in the file's top
  docstring or comment. The gateway's `Hela.PlaygroundLimiter`
  starts a GenServer in `Hela.Application`; that wiring is
  visible in `application.ex`. **(review)**.
- Constructors do not perform IO. If a struct needs IO to
  initialize, it has a separate `start/1` or `connect/1`
  function. **(review)**.

## concurrency

- The gateway runs on Phoenix Channels with one process per WS
  connection. Channel processes communicate via `PubSub` and
  ETS. `cache:sync` broadcasts mirror writes across nodes within
  a region.
- The control plane is request/response Phoenix; no long-running
  GenServers other than `Repo` and `Endpoint`.
- TypeScript SDK is async/await throughout. Promises are awaited
  or returned, never fired-and-forgotten without a comment.
  **(review)**.
- Python SDK is asyncio. Sync helpers are not exposed; if a sync
  caller is needed, they call `asyncio.run`. **(review)**.

## public API surface

- The wire protocol is OpenAPI 3.1 in
  `packages/schemas/openapi.yaml`, plus the JSON schemas for
  WebSocket frames in `packages/schemas/wire/`. Anything not in
  there is not part of the public API.
- Only additive changes to the stable path. Renaming or removing
  a field is a breaking change and requires a `WIRE_VERSION` bump
  plus coordinated SDK releases. **(review)** + the
  `schema-drift` CI gate **(tooling)**.
- New endpoints are versioned: `/v1/...`. Internal endpoints
  prefix with `/_internal/...`. **(review)**.

## formatter and linter

These are non-negotiable, enforced in CI:

- TypeScript: `bunx prettier --check` and `bunx tsc --noEmit`.
- Elixir: `mix format --check-formatted` and
  `mix compile --warnings-as-errors`.
- Python: `ruff format --check` and `ruff check`.
- Go: `gofmt -d` and `go vet ./...`.
- Rust: `cargo fmt --check` and `cargo clippy -D warnings`.
- HCL: `terraform fmt -check`.

CI rejects PRs that fail any of these. **(tooling)**.

## CI deploy gates

The `/health` body must equal `ok\n`. The `/version.commit` JSON
field must equal `${{ github.sha }}` for web and app deploys. Both
are enforced in `.github/workflows/ci.yml`. Do not weaken either.
**(tooling)**.

The gateway's `/version` does not include a `commit` field, so it
is not behind the commit-match gate. State this explicitly in
deploy summaries; do not call gateway deploys "commit-verified".
**(judgment)**.

## what counts as "done"

A change is shipped when:

1. The package's tests pass locally.
2. The change is on `main`.
3. CI is green for that SHA.
4. For deploy-bearing changes: production `/version.commit` (web,
   app) reports the SHA, and the relevant smoke test ran.
5. For SDK changes: the live `sdk-js · e2e playground` job ran
   green against deployed surfaces.

CI green alone is not "done". A user-facing flow can be broken
even when every job is green; that incident is logged in
`mistakes.md` under "Retry-on-429 covered up a real rate-limit
bug". **(judgment)**.
