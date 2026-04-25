# testing

The test pyramid as it actually exists in this repo. If a section
contradicts what the code does, the code wins; update this file.

## what runs where

| Layer | Lives in | Run with | What it covers |
| --- | --- | --- | --- |
| Elixir unit | `apps/<svc>/test/**/*_test.exs` | `cd apps/<svc> && mix test` | Pure module logic, channel join/publish, billing facade, schema changesets |
| Elixir integration | same files, marked `@tag :integration` | `mix test --include integration` | DB roundtrips, real Postgres |
| TypeScript typecheck | per-package | `bunx tsc --noEmit -p <pkg>` | Wire type drift, public API shape |
| Python unit | `packages/sdk-py/tests/**` | `cd packages/sdk-py && uv run pytest` | Transport, channel, presence, REST |
| Python live | same files, gated by `HELA_LIVE=1` | `HELA_LIVE=1 uv run pytest -m live` | Hits a real gateway over WS |
| Go unit | `packages/sdk-go/*_test.go` | `cd packages/sdk-go && go test ./...` | Transport, channel, presence, REST |
| Rust unit | `packages/sdk-rs/tests/**` and inline `mod tests` | `cd packages/sdk-rs && cargo test` | Same shape as Go and Py |
| Browser e2e (preview) | `packages/sdk-js-e2e/tests/**` | `cd packages/sdk-js-e2e && bun run test` | Playwright against a local Bun mock gateway and the Vite preview build |
| Browser e2e (deployed) | same files, `HELA_E2E_BASE_URL` set | `HELA_E2E_BASE_URL=<prod-web-url> bun run test` | Playwright against live Railway |
| Schema drift | n/a | `make sdk.gen && git diff --exit-code packages/sdk-py/src/hela/_generated/ packages/sdk-types/src/` | OpenAPI vs generated SDK types |

## what counts as unit vs integration vs e2e here

- **Unit** runs in milliseconds, no IO except in-memory ETS or
  in-process state. Channel logic, presence merge, JWT mint, REST
  request shaping.
- **Integration** touches Postgres or the network. Marked with
  `@tag :integration` (Elixir) or `pytest.mark.live` (Python). DB
  is a real Postgres started by `docker-compose up -d postgres` or
  the GitHub Actions service container.
- **e2e** is Playwright, real Chromium, real WebSocket. Two
  modes: against a local Bun mock gateway (deterministic), and
  against deployed production (catches real regressions).

## fixtures and test data

- Elixir: factories live in `apps/<svc>/test/support/`. Each
  schema has a `*_fixture/0` and a `*_fixtures/1` for variants.
- TypeScript and Playwright: `packages/sdk-js-e2e/fixtures/`.
  Tokens are minted via the live control plane in deployed mode,
  via the mock gateway in preview mode.
- Python: pytest fixtures in `packages/sdk-py/tests/conftest.py`.
- Go: table-driven tests, no shared fixtures package.
- Rust: per-test setup in `tests/*.rs`.

## external dependencies in tests

- **Postgres**: real container. Locally via `docker-compose up -d
  postgres`, in CI via the workflow's `services.postgres` block
  on `postgres:18-alpine`. No SQLite substitution; the driver
  features differ.
- **Gateway** (in SDK tests): the Bun mock at
  `packages/sdk-js-e2e/mock_server.ts` speaks Phoenix Channel v2.
  When testing the deployed surface, point the SDK at
  `gateway-production-bfdf.up.railway.app` via env.
- **Polar**: never called from tests. `Control.Billing` is a
  facade; the `POLAR_ACCESS_TOKEN`-unset path no-ops, and tests
  rely on that.
- **Redis, Kafka, etc.**: not used. Do not introduce one for a
  test.

## required test coverage for new code

Concrete rules, not "good coverage":

- Every business-rule branch in Elixir and Python gets a unit
  test. A "business rule" is anything that a customer would
  notice, including auth checks, quota checks, ephemeral-vs-not
  branching, and rate limit decisions.
- Every wire-protocol shape change in
  `packages/schemas/openapi.yaml` gets a positive and a negative
  test in at least one SDK.
- Every bug fix gets a regression test that fails before the fix
  and passes after.
- Trivial wiring (config plumbing, rename-only refactors, type
  reshuffles) does not require a test, but it does require the
  affected package's full test suite to still pass.

## flaky test policy

- A test that fails twice in 10 consecutive CI runs goes into
  quarantine: tagged `@tag :flaky` (Elixir) or `test.skip(...)`
  (Playwright) with a comment linking the most-recent failed run.
- Quarantined tests have a 5-business-day fix window. If not
  fixed by then, delete and open an issue describing what
  coverage is now missing.
- Owner of a flaky test is the person who last touched the file
  it lives in. They may delegate, but cannot ignore.

## snapshot and golden file tests

- Acceptable for: HTML rendered by Phoenix LiveView templates,
  generated wire types in `_generated/`, OpenAPI YAML.
- Not acceptable for: business logic, anything where a human has
  to mentally compute "is the new snapshot correct?". If the test
  output is only checkable by squinting, write a real assertion.

## browser e2e specifics

The `sdk-js · e2e playground` job is the closest signal we have
to a real user flow. Rules:

- Do not filter signal out of the test to make it pass. The
  `consoleErrors.toEqual([])` assertion exists to catch real
  4xx/5xx and reconnect storms; if the test is failing on a 429,
  fix the rate limit, not the test.
- Tests use `page.on("response", ...)` to assert no 429 on
  `/playground/token`. Adding a server-side limit that bites
  legitimate first-paint traffic will fail the test.
- Tests use `window.__helaReady` and `window.__helaDebug` shapes
  declared in `apps/web/src/lib/hela.ts` and mirrored in
  `packages/sdk-js-e2e/types/globals.d.ts`. If you change one,
  update the other in the same commit.

## performance and load tests

None in tree today. When added, they live under
`apps/<svc>/perf/` and run only on demand (`mix run perf/...`),
never in regular CI.

## what never needs a test

- Renames where nothing else changes.
- Pure config plumbing (env var read, passed to a library).
- Documentation-only PRs.
- Auto-generated code in `_generated/`.

## what always needs a test

- Auth and authorization decisions.
- Quota and rate-limit decisions.
- Ephemeral-vs-persistent branching in the gateway.
- Bug fixes (the regression test is mandatory).
- Anything a security review touched.
