# CLAUDE.md, contract for agentic work on hela

Read this first. These rules bind every Claude/Copilot/agent session
that touches this repo. If a rule conflicts with something you read
elsewhere, this file wins, then `docs/dev/`.

## project at a glance

- Managed real-time on BEAM (Pusher/Ably alternative). Self-hostable.
- Monorepo: Elixir gateway + control, React web + app, four SDKs
  (TS / Python / Go / Rust). Schemas in `packages/schemas/` are the
  source of truth, SDK types are generated.
- Hosted plane runs on Railway (one Amsterdam gateway today). Fly is
  a documented secondary path, not active.
- Billing is Polar. Not Stripe. Stripe was rejected and removed.

## hard rules

These are derived from real incidents in prior sessions. Breaking one
means you are repeating a mistake we already paid for. See
`docs/dev/mistakes.md` for the source incident behind each.

1. Do not paper over a failing test by filtering its signal. If a
   `consoleErrors.toEqual([])` test is catching a real 4xx, fix the
   server, do not filter the 4xx out of the assertion.
2. Do not add a retry loop to hide a server bug. Retries are for
   genuine transients (network blip, cold start). For consistent
   server responses, fix the server.
3. Run a fresh `grep -ri` from repo root before claiming a sweep is
   done. Sweeps that only touched README and docs missed `stripe_`
   in TS types and `hela.dev` in `infra/fly/*.toml`.
4. Sequence destructive ops correctly. When changing a Railway
   service's image and attaching a volume in the same change, set
   the image first. Otherwise the old image initdb's the volume and
   the new image cannot read it.
5. Never claim a deploy succeeded based on `/health` alone if the
   real signal is a downstream dependency. Use `/version` (which
   forces a release-script execution path) or curl an endpoint that
   actually exercises the dependency.
6. Pin status checks by id, not by `first: 1`. `serviceInstanceUpdate`
   followed by `deployments(first: 1)` can return the prior deploy.
   Always capture the deployment id from the trigger mutation.
7. Do not extend transitive permission. "Yes do the upgrade" does not
   authorize a `volume delete`. State the destructive sub-step,
   confirm, then act.
8. Read the actual config before assuming a BEAM feature is wired.
   This repo has no `libcluster` and no `Node.connect`, so the host
   part of `RELEASE_NODE` is a label, not a routable address. Treat
   it as a label until clustering ships.
9. CI green is not feature-works. The `sdk-js · e2e playground` job
   is the closest signal we have to a real browser flow, and even
   that lies if the test is filtering its own errors.
10. **Auth and billing changes are gated on the dev environment
    integration test.** If your diff touches
    `apps/control/lib/control/accounts*`,
    `apps/control/lib/control/billing*`,
    `apps/control/lib/control_web/controllers/auth_controller.ex`,
    or any flow that creates or mutates a Polar customer or
    subscription, you MUST run the test in
    [`docs/dev/dev-env-integration.md`](docs/dev/dev-env-integration.md)
    against the **dev** Railway env (sandbox Polar) and paste its
    output in the PR before requesting merge to `main`. CI does not
    run this yet — that is not a license to skip. Local `mix test`
    catches unit bugs; this catches wiring bugs (CORS, cookies,
    Polar HTTP, env var typos) that only surface against a real
    deploy.

## before you code

1. `git pull --rebase`. Then `git status`. The repo state may not be
   what you remember from last session.
2. Read the file you are about to edit, end to end. Hooks may have
   shown you only a slice.
3. If the change touches a wire-level type, edit
   `packages/schemas/openapi.yaml` or the wire schema first, then
   `make sdk.gen`. Never hand-edit `_generated/`.
4. If it is a non-trivial feature, write the plan into
   `.cursor/plans/<slug>.plan.md` first. List the files you intend
   to touch and the contract changes you intend to make. The plan
   is the spec.
5. Search for the symbol you are about to add or rename. If anything
   matches in another file, you have a coordination problem to
   resolve before editing.

## before you commit

1. Run the package's typechecker and tests. See `docs/dev/testing.md`
   for the exact commands per language.
2. Subject must match `^[A-Za-z0-9 ,:()#]+$`, with the human
   content 4–72 chars excluding any trailing ` (#NNN)` PR-number
   suffix (GitHub's squash-merge appends one to every merged
   subject; the auto-suffix is not part of the budget).
   Conventional-Commit prefixes are fine. Hyphens, dots,
   underscores and other punctuation stay out.
3. One logical change per commit. If you have to write `also: ...`
   in the body, split.
4. Body explains *why*, not *what*. The diff shows what.
5. Do not skip pre-commit hooks (`--no-verify`) without a stated
   reason in the commit body.

## before you push

1. Did you actually run the affected tests, or just hope they pass?
   If you only ran a typechecker, say so in the PR body.
2. Did you grep the repo for any string you renamed? `stripe_` and
   `hela.dev` both survived prior sweeps that did not do this.
3. If your diff touches auth or billing (rule 10 above), you must
   have run the dev-env integration test against the dev Railway
   env. Paste the output (last `dev integration: ...` line at
   minimum) into the PR body. No exceptions.
4. Variable values now live in `railway` CLI per environment, not
   in Terraform. If you added a new env var, did you update
   [`infra/railway/README.md`](infra/railway/README.md)'s matrix
   and run `railway variable set` against both envs?

## branches and merging

- Two long-lived branches: `main` (production Railway env target) and
  `dev` (dev Railway env target, sandbox Polar). Feature branches
  open PRs into `dev` first; once green there and the dev-env
  integration test passes, a `dev` to `main` PR ships to production.
  Squash-only merges, linear history on both.
- `enforce_admins: false` is set on `v0id-user/hela`. The owner has
  explicitly opted in to admin-bypass for solo maintenance:
  `gh pr merge --admin --squash --delete-branch` is acceptable when
  the owner has stated intent to ship a failing-CI PR. Do not
  extend this pattern to other repos.
- Pending-deployment auto-approve via `gh api -X POST
  repos/v0id-user/hela/actions/runs/<RUN_ID>/pending_deployments` is
  also acceptable on this repo. See
  `docs/dev/development-cycle.md` for the exact payload.

## SDKs

Four in tree, in this order of investment:

- `packages/sdk-js/`, TypeScript, phoenix.js under the hood, also
  imported by the web and app clients
- `packages/sdk-py/`, Python, asyncio + Pydantic v2
- `packages/sdk-go/`, Go, `coder/websocket` + stdlib
- `packages/sdk-rs/`, Rust, `tokio-tungstenite` + `reqwest`

Wire types are generated. Domain API and transport are hand-written.
Adding a new language SDK requires opening an issue first, since
each one is real maintenance cost.

## deployment

- Railway is primary. `infra/railway/main.tf` is the source of
  truth. Apply via `terraform apply` from `infra/railway/`. If
  Terraform is not installed locally, you can apply individual
  changes via `railway` CLI or the GraphQL API at
  `https://backboard.railway.com/graphql/v2`, but you must reconcile
  the change back into `main.tf` in the same PR.
- The `/version.commit` deploy gate in `.github/workflows/ci.yml`
  verifies the pushed SHA actually shipped. Do not loosen it.
- Postgres runs on `postgres:18-alpine`, with a Railway volume
  mounted at `/var/lib/postgresql/data` and `PGDATA` pointed at the
  `pgdata/` subdirectory under that mount. See
  `docs/dev/environment.md` for the rationale.
- Fly is documented as secondary in `infra/fly/`. The toml files
  point at `*.fly.dev` hostnames. Do not add `*.hela.dev`
  references; the project does not own that domain.

## secrets

Never commit secrets. Never echo or log tokens. If you see a token
in a transcript, treat it as compromised and rotate it. Use GitHub
environment secrets. The owner may paste tokens into the
conversation for setup; redact them from any output you produce.

## licensing

AGPL-3.0-or-later for code. Brand assets in `apps/web/public/brand/`
have a trademark carve-out documented in `apps/web/public/brand/LICENSE.md`.
New source files need an SPDX header.

## where to find detailed docs

- `docs/dev/README.md`, index of dev docs
- `docs/dev/mistakes.md`, post-mortem log of session-level mistakes
- `docs/dev/development-cycle.md`, the actual contributor loop
- `docs/dev/naming-conventions.md`, per-language naming rules
- `docs/dev/code-quality.md`, "works on my machine is not shipped"
- `docs/dev/testing.md`, the test pyramid as it exists here
- `docs/dev/environment.md`, runtime versions, env vars, secrets
- `docs/dev/pitfalls.md`, sharp edges
- `docs/architecture.md`, mental model for the system
- `docs/runbook.md`, ops scenarios

## how to ask for help

Before escalating, gather:

1. The exact command you ran and the output.
2. The git SHA you are on (`git rev-parse HEAD`).
3. The branch state (`git status --short`).
4. The relevant log line, not a paraphrase.
5. What you have already tried, and what made you stop.

A five-minute clarification beats an hour of rework.
