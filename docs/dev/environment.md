# environment

What is needed to reproduce the runtime, exactly. If a value here
disagrees with `.tool-versions`, `package.json`, `mix.exs`,
`pyproject.toml`, `go.mod`, or `Cargo.toml`, those files win and
this one needs an update.

## required runtime versions

| Tool | Version | Source of truth |
| --- | --- | --- |
| Elixir | 1.17.3 | `apps/gateway/Dockerfile`, `apps/control/Dockerfile`, `.github/workflows/ci.yml` `ELIXIR_VERSION` |
| Erlang/OTP | 27.1.2 | same as above |
| Bun | 1.1.x | `oven-sh/setup-bun@v2` in CI; `oven/bun:1.1` in `docker-compose.yml` |
| Node | not used at runtime | n/a, scripts use `bun run` |
| Python | 3.11+ | `packages/sdk-py/pyproject.toml` `requires-python` |
| Go | 1.23+ | `packages/sdk-go/go.mod` |
| Rust | 1.75+ MSRV | `packages/sdk-rs/Cargo.toml` `rust-version` |
| Terraform | 1.7+ | `infra/railway/providers.tf` `required_version` |
| Docker | recent | for `docker compose` |

`uv` is required for Python work.

## package managers and lockfiles

- TypeScript: Bun. Lockfile is `bun.lock` at repo root, plus
  per-package `package.json`. Use `bun install --frozen-lockfile`
  in CI.
- Elixir: Mix. Lockfile is `apps/<svc>/mix.lock`, committed.
- Python: uv. `packages/sdk-py/uv.lock` is committed.
- Go: stdlib modules, `go.sum` committed.
- Rust: cargo, `Cargo.lock` committed.

Never install a dep with the wrong package manager. `npm install`
or `pip install` in this repo is wrong by default.

## system dependencies

Required to run the full local stack:

- Docker. Used for Postgres 18 + mailpit.
- A working `git`.

Optional:

- `rsvg-convert`, `oxipng`, `cwebp`. Only needed to rasterize
  brand assets (`scripts/brand_render.sh`). Install via Homebrew.
- `terraform`. Needed to apply infra changes the canonical way.
  Without it, you can apply via `railway` CLI / GraphQL but you
  must reconcile back into `infra/railway/main.tf`.

## environment variables

Documented per audience. `*` after the name means required at
runtime in production.

### app code (`HELA_*`)

| Name | Purpose | Example | Required |
| --- | --- | --- | --- |
| `HELA_REGION`* | Region slug for the gateway. Used in `RELEASE_NODE` and the metrics tag. | `ams` | gateway only |
| `HELA_LIVE` | When `1`, Python SDK live integration tests run against a real gateway. | `1` | tests only |
| `HELA_API_KEY` | Project API key for SDK live tests. | `hk_…` | tests only |
| `HELA_PRIVATE_KEY` | JWK for signing customer JWTs in SDK live tests. | JSON blob | tests only |
| `HELA_E2E_BASE_URL` | Playwright deployed-mode target. | `https://web-production-f24fc.up.railway.app` | e2e only |
| `HELA_E2E_MOCK_PORT` | Bun mock server port for preview mode. | `4010` | e2e only |
| `HELA_GATEWAY_URL`, `HELA_CONTROL_URL`, `HELA_APP_URL`, `HELA_WEB_URL` | Deployed surface URLs the e2e and smoke jobs target. | Railway URLs | CI |

### Phoenix runtime

| Name | Purpose | Required |
| --- | --- | --- |
| `PHX_SERVER`* | `true` to start the HTTP listener. | yes |
| `PHX_HOST`* | Externally-visible hostname. | yes |
| `SECRET_KEY_BASE`* | 64+ char random for signed cookies and Phoenix tokens. | yes |
| `DATABASE_URL`* | `ecto://user:pass@host:5432/db`. | yes |
| `POOL_SIZE` | DB pool size. | optional, defaults to 10 |
| `ECTO_IPV6` | `1` enables IPv6 client. Required on Railway and Fly. | required on Railway |

### internal trust

| Name | Purpose |
| --- | --- |
| `GATEWAY_INTERNAL_SECRET`* | Shared secret signing `/_internal/*` requests between control and gateway. |
| `PLAYGROUND_SECRET`* | Symmetric key for minting playground JWTs. |

### Polar billing

All optional in dev. `Control.Billing` no-ops if `POLAR_ACCESS_TOKEN`
is unset.

| Name | Purpose |
| --- | --- |
| `POLAR_ENV` | `sandbox` or `production`. |
| `POLAR_ACCESS_TOKEN` | Server-side API key. |
| `POLAR_ORG_ID` | Polar organization id. |
| `POLAR_WEBHOOK_SECRET` | HMAC secret for verifying inbound webhooks. |
| `POLAR_PRODUCT_STARTER`, `POLAR_PRODUCT_GROWTH`, `POLAR_PRODUCT_SCALE` | Product ids per tier. |

### deploy / build

| Name | Purpose |
| --- | --- |
| `RAILWAY_PRIVATE_DOMAIN` | Per-service `*.railway.internal` hostname. Used in `RELEASE_NODE`. Injected by Railway. |
| `RAILWAY_PRIVATE_IP` | IPv6 address on the private network. Injected by Railway when present. |
| `RAILWAY_GIT_COMMIT_SHA`, `SOURCE_VERSION`, `GITHUB_SHA` | Commit SHAs forwarded into the build for `version.json` stamping. |
| `RAILWAY_DOCKERFILE_PATH` | Per-service Dockerfile path under monorepo root. |
| `RAILWAY_RUN_UID` | Set to `0` only as escape hatch for non-root containers needing volume root. Postgres uses the `PGDATA` subdir trick instead. |
| `PGDATA` | `/var/lib/postgresql/data/pgdata`. Subdirectory under the volume mount; lets the postgres entrypoint chown it on first boot. |
| `POSTGRES_INITDB_ARGS` | `--data-checksums`. Pinned even though PG18 makes it the default. |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Standard postgres image envs. |

### vite (build-time, baked into the bundle)

| Name | Purpose |
| --- | --- |
| `VITE_HELA_API` | Base URL for the gateway. |
| `VITE_HELA_GATEWAY` | Same as above, used by the dashboard app. |
| `VITE_HELA_CONTROL` | Base URL for the control plane. |
| `VITE_HELA_APP` | Base URL for the dashboard app, used by the marketing web. |

## secrets handling

- Real secrets live in GitHub repo and environment secrets. The
  `production` environment carries the deploy-time secrets;
  per-job secrets (Polar, Railway token) live at the repo level.
- `infra/railway/secrets.tf` declares Terraform variables; values
  come from `terraform.tfvars` (gitignored) or env-var
  `TF_VAR_*`.
- `.env.example` files (when present) show the shape; the real
  `.env` is gitignored.
- Never echo a token in CI logs. Never paste a token into a
  generated file. If a token appears in a transcript, rotate it.

## recommended editor setup

Optional, not required.

- VS Code with `ElixirLS`, `Tailwind CSS IntelliSense`, `Rust Analyzer`,
  `Prettier`. Workspace settings live in `.vscode/`.
- For terminals: `direnv` + `.envrc` works for per-directory env
  loading.

## common setup failures

- **`bun install` fails with workspace error**: ensure you ran it
  from the repo root, not inside an `apps/*` or `packages/*`
  directory.
- **`mix deps.get` hangs**: hex.pm sometimes flakes. CI retries
  this 5x. Locally, just retry.
- **`docker compose up` fails on postgres**: check that no other
  postgres is bound to `:5432`. Stop any local postgres or change
  the host port mapping.
- **`mix ecto.create` fails with auth error**: the
  `POSTGRES_PASSWORD: postgres` in `docker-compose.yml` is the
  password the apps assume. If you ran `docker compose up` once,
  changed the password, then up again, the volume still has the
  old credentials. `docker volume rm hela_pgdata` and re-up.
- **`bunx tsc --noEmit -p packages/sdk-js-e2e` errors on
  `__helaReady`**: `apps/web/src/lib/hela.ts` and
  `packages/sdk-js-e2e/types/globals.d.ts` declare the same
  Window augmentation. If you added a field in one, add it in the
  other.
- **Production `/health` returns HTML instead of `ok`**: stale
  Railway deploy. `dist/` was missing from the upload because the
  repo-root `.gitignore` excludes it. The `apps/web/.railwayignore`
  and `apps/app/.railwayignore` re-include `dist/` for the
  upload. The CI `/version.commit` gate will fail loud now if
  this regresses.
