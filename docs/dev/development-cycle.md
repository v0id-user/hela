# development cycle

The actual loop a contributor follows in this repo. Not the
aspirational one. When several paths exist, this picks the canonical
one and explains why.

## starting a new task

1. `git fetch origin && git checkout main && git pull --rebase`.
2. `git status`. If working tree is dirty, deal with that before
   anything else (stash, commit, or `git restore`).
3. Branch name: descriptive, no prefix. `git checkout -b
   <slug-of-the-change>`. Examples: `pg-18-bump`, `429-retry-fix`,
   `ephemeral-demo-mode`.
4. If the change is non-trivial, write
   `.cursor/plans/<slug>.plan.md` first. The plan lists files to
   change and contract changes allowed. See
   `.cursor/plans/ephemeral_demo_mode_627c9e63.plan.md` for the
   reference shape.

## bringing the repo into a runnable state from cold

Required versions are pinned in `docs/dev/environment.md`. Short
version: install `bun`, `mix` (Elixir 1.17.3 / OTP 27.1.2), `uv`,
`go`, `cargo`, and `docker` via Homebrew. Then:

```sh
git clone https://github.com/v0id-user/hela
cd hela
bun install                # workspace deps for all TS packages
make sdk.gen               # regenerate Python + TS wire types
docker compose up -d postgres mailpit
```

Per-service one-time setup:

```sh
(cd apps/gateway && mix deps.get && mix ecto.setup)
(cd apps/control && mix deps.get && mix ecto.setup)
(cd packages/sdk-py && uv sync)
```

If any step fails, see `docs/dev/environment.md` "common setup
failures".

## running the service or app locally

Two canonical paths.

**Path A, full local stack via docker compose** (preferred for
testing the wire end to end):

```sh
docker compose up
```

Brings up postgres, gateway on `:4001`, control on `:4000`, web on
`:5173`, app on `:5174`, mailpit on `:8025`.

**Path B, hot-reload Elixir with native bun for frontend** (preferred
for iteration on a single service):

```sh
docker compose up -d postgres
(cd apps/gateway && iex -S mix phx.server)   # in one shell
(cd apps/control && iex -S mix phx.server)   # in another
(cd apps/web && bun run dev)                 # third
(cd apps/app && bun run dev)                 # fourth
```

Path A is what the dashboard demo expects. Path B is what you
should use when iterating on a single Elixir module.

## running tests

Per-package, run from the package directory unless noted.

| Surface | Command | Notes |
| --- | --- | --- |
| gateway unit | `cd apps/gateway && mix test` | requires postgres up |
| control unit | `cd apps/control && mix test` | requires postgres up |
| sdk-js typecheck | `bunx tsc --noEmit` from repo root | |
| sdk-py | `cd packages/sdk-py && uv run pytest` | live tests gated by `HELA_LIVE=1` |
| sdk-go | `cd packages/sdk-go && go test ./...` | |
| sdk-rs | `cd packages/sdk-rs && cargo test` | |
| sdk-js e2e (preview, mock gateway) | `cd packages/sdk-js-e2e && bun run test` | starts a local Bun mock server |
| sdk-js e2e (against deployed prod) | `HELA_E2E_BASE_URL=https://web-production-f24fc.up.railway.app cd packages/sdk-js-e2e && bun run test` | runs against live Railway |
| sdk-js-e2e typecheck | `cd packages/sdk-js-e2e && bun run typecheck` | catches `__helaReady` shape drift |
| schemas drift check | `make sdk.gen && git diff --exit-code packages/sdk-py/src/hela/_generated/ packages/sdk-types/src/` | CI runs the same |

CI runs every suite on every PR. Do not bypass with `[skip ci]`
unless the change touches zero test files.

## running the linter, formatter, type checker

| Language | Format | Lint | Typecheck |
| --- | --- | --- | --- |
| TypeScript | `bunx prettier --write` | `bunx eslint` | `bunx tsc --noEmit` |
| Elixir | `mix format` | `mix compile --warnings-as-errors` | n/a |
| Python | `ruff format` | `ruff check` | `mypy src` (when configured) |
| Go | `gofmt -w` | `go vet ./...` | n/a |
| Rust | `cargo fmt` | `cargo clippy -D warnings` | n/a |
| HCL | `terraform fmt -check` | n/a | n/a |
| Shell | `shfmt -i 2 -w` | n/a | n/a |

`mix compile --warnings-as-errors` doubles as a lint gate for
Elixir. `_generated/` Python is excluded from `ruff` via
`extend-exclude` in `packages/sdk-py/pyproject.toml`.

## validating changes before pushing

1. Run the affected package's tests. If you only ran the
   typechecker, say so in the PR body.
2. `rg <symbol>` for any name you renamed. The `stripe_` and
   `hela.dev` sweeps survived prior cleanups by skipping this step.
3. If the change touches Terraform, either run `terraform fmt`
   (Railway: `infra/railway/`, generic: `infra/terraform/`) or
   confirm CI's `terraform · fmt` job will catch it.
4. If you changed a service config live (image, env, volume) via
   `railway` CLI or GraphQL, reconcile the change into
   `infra/railway/main.tf` in the same PR.

## opening a PR

Title must match `^[A-Za-z0-9 ,:]{4,72}$`. PR body must:

1. Reference a plan in `.cursor/plans/` if there is one.
2. List the surfaces touched (gateway, control, web, app, sdk-*).
3. Note any contract change (additive or breaking).
4. State which tests you ran and which you skipped.

CI will run lint, typecheck, all unit suites, schema drift, and
deploy gates. Required checks for production deploy are listed in
`.github/workflows/ci.yml`. The owner has explicitly opted in to
admin bypass on this repo:

```sh
# Approve a pending production deployment
gh api -X POST repos/v0id-user/hela/actions/runs/<RUN_ID>/pending_deployments \
  --input - <<'EOF'
{"environment_ids":[<ENV_ID>],"state":"approved","comment":"admin bypass"}
EOF

# Or merge a failing-CI PR the owner intended to ship
gh pr merge <NUM> --admin --squash --delete-branch
```

Do not extend admin bypass to other repos.

## handling merge conflicts

1. `git pull --rebase origin main` first. If a conflict appears,
   resolve in place.
2. Read both sides. The "ours / theirs" labels lie under rebase
   (they are flipped relative to merge).
3. Pick the side that matches the *most recent canonical
   decision*. For UI copy, that means whichever main commit landed
   the new positioning. For Elixir, run `mix compile` after
   resolving to confirm.
4. After staging the resolution, run the affected tests before
   continuing the rebase.
5. Never run `git checkout --theirs` blindly. It looks fast and
   destroys the work you came to keep.

## rolling back a broken change

Rolling back a deploy that already shipped is a Railway-side action,
not a git revert. Two paths.

**Fast rollback via Railway dashboard:** redeploy the previous
deployment by id. No code change, no CI run.

**Code rollback:**

```sh
git checkout main
git revert <SHA>            # creates a new revert commit
git push origin main        # CI re-runs and re-deploys
```

If a database migration was part of the change, the revert commit
must include the down migration. If it did not, write a new forward
migration that undoes the schema change. Never edit a committed
migration.

After the rollback, write a one-paragraph entry in
`docs/dev/mistakes.md` so the next session knows what happened.
