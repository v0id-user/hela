# RESUME — hela session (paused 2026-04-24)

One-stop handoff for the next LLM (or future-me) to pick up without re-reading
the whole transcript. Keep updated whenever work pauses.

---

## state of the world

- Repo is `v0id-user/hela` on GitHub. Monorepo: Elixir gateway + control, React
  web + app, four SDKs (Python/TS/Go/Rust), one live Railway deployment in
  Amsterdam (Railway `europe-west4`).
- `main` is at commit `1df19bf` as of this write. All pushed.
- CI is green for `main`; the owner prefers admin-bypass on pending
  deployments (see `CLAUDE.md` → "admin bypass"). Agents should approve
  pending deploys via `gh api` rather than waiting.

## live URLs (Railway, until a real domain is owned)

| surface | URL |
| ------- | --- |
| gateway | `https://gateway-production-bfdf.up.railway.app` |
| control | `https://control-production-059e.up.railway.app` |
| app     | `https://app-production-1716a.up.railway.app` |
| web     | `https://web-production-f24fc.up.railway.app` |

**hela.dev is NOT owned by the project.** Do not reference it anywhere that
gets dialed or displayed as an authoritative URL. Every SDK region map resolves
every hosted slug to the single Railway gateway above. The `/status` page is
the truth-teller about what's actually deployed.

## what shipped this session (commit boundaries)

Last ~6 commits, oldest → newest:

1. `fix: rename fra to ams everywhere and fail loudly on unset HELA_REGION`
   — dropped `fra` (Frankfurt was aspirational), added `ams` (Amsterdam is
   where Railway actually runs). Gateway `HELA_REGION` now crashes at boot
   when unset.
2. `docs: add admin bypass section to CLAUDE md`
3. `feat: web adds signup redirect, status page, and get started nav CTA`
4. `feat: gateway per IP playground limiter and region field rename`
   — `Hela.PlaygroundLimiter` + plug. `/regions` returns `region` not the old
   `you_are_on`. openapi.yaml updated; Python types regenerated.
5. `fix: stop dialing hela.dev and ship brand assets`
   — critical: SDKs no longer dial `*.hela.dev`. Brand SVGs + PNGs live in
   `apps/web/public/brand/`.

Set on Railway (not in the repo): `HELA_REGION=ams` on the `gateway` service
in the `production` environment.

## brand assets (where the user expects them)

`apps/web/public/brand/`:
- `mark.svg` — three-dot presence roster in gold brackets
- `wordmark.svg` — terminal `[ hela ]` in mono
- `lockup.svg` — mark + wordmark combined
- `favicon.svg` — 2-dot variant that survives 16 px
- `og.svg` — 1200×630 social card
- `png/` — rasterizations at 1x, 2x, and favicon sizes (128/256/512/1024
  for mark, 1x/2x for wordmark/lockup/og, 32/180 for favicon)

Wired in `apps/web/index.html`: favicon link, apple-touch-icon, og:image,
twitter:image. All point at `web-production-f24fc.up.railway.app/brand/png/og.png`.

## known gaps — pick up here

### P0 — not yet done

- **CI audit for Railway deploy failures.** Every `deploy-*` job uses
  `railway up --ci --detach`, which returns as soon as the build is
  submitted. If the build then fails, CI stays green. Add a post-deploy
  healthcheck step per service that curls `<railway_url>/health` in a
  loop (e.g. 60 attempts, 5 s apart) and fails the job if it never
  returns 200. File: `.github/workflows/ci.yml` (jobs `deploy-control`,
  `deploy-gateway`, `deploy-app`, `deploy-web`).
- **Custom domain.** The project does not own `hela.dev`. When a real
  domain is registered:
  1. Update `VITE_HELA_API` / `VITE_HELA_GATEWAY` / `VITE_HELA_CONTROL` /
     `VITE_HELA_APP` on the Railway services
  2. Replace the Railway URLs in the SDK region maps
     (`packages/sdk-{types,py,go,rs}/...` — search for
     `gateway-production-bfdf`)
  3. Update the `og:url` / `og:image` meta in `apps/web/index.html`
  4. Update the OG SVG text (`apps/web/public/brand/og.svg`) and
     re-rasterize via `rsvg-convert`

### P1 — deferred from this session

- **Per-region deployment.** Right now every region slug (iad/sjc/ams/sin/syd)
  resolves to the single Amsterdam gateway. To add a second region:
  spin up another Railway gateway service, set its `HELA_REGION` env var
  to the slug, update the region map in the SDKs + web to point that
  slug at the new URL. The Terraform in `infra/railway/` takes one
  `gateway_region_slug` variable per service instance.
- **Billing: flip Polar sandbox → production.** User said this is a
  one-click change; `POLAR_ENV=sandbox` → `production` on the control
  service and rotate the access token. Not wired in TF — look at
  `apps/control/config/runtime.exs` for the env var.
- **Optional:** fix OG card's `{"region":"ams", "regions":[…]}` log tail
  once a real user-facing curl example is ready.

### small follow-ups (won't break anything if skipped)

- `apps/web/src/components/Hero.tsx` CTA says `[ start free ]` — points at
  `signupUrl()` (working). Could be rephrased.
- `infra/fly/*.toml` files still reference `app.hela.dev` and friends. The
  Fly path isn't live, so this is cosmetic — update when/if we pivot to Fly.
- `docs/` has a few places that still say `hela.dev` in prose
  (architecture.md mentions `hela.dev/how` as the aspirational docs
  site). Replace when the domain is settled.
- `packages/sdk-*/Cargo.toml|pyproject.toml` have `homepage = "https://hela.dev"`
  — update to the GitHub repo or the real domain once owned.
- Remaining `hela.dev` references in `packages/schemas/wire/*.schema.json`'s
  `$id` fields are JSON-Schema URIs (identifiers, not dialable URLs). They're
  stable identifiers and changing them would break SDK type generation
  diffs. Safe to leave; revisit if we ever publish the schemas at a real URL.

## key rules to respect (from CLAUDE.md)

- **Small focused commits.** One logical change per commit. User explicitly
  said this; reinforced in `CLAUDE.md`.
- **Commit subject format:** `^[A-Za-z0-9 ,:]{4,72}$`. No parens, hyphens,
  underscores in subjects. Colons and Conventional-Commits prefixes OK.
- **Schemas are the source of truth.** Never edit `_generated/` by hand;
  run `make sdk.gen` after any schema change.
- **Admin bypass is in effect on this repo.** Approve pending prod deploys
  via `gh api` — do not make the user click around.
- **Python scripts use `uv run` + PEP 723 inline deps.** TypeScript scripts
  use `bun run`. No `node` or `ts-node`, no committed `requirements.txt`.
- **AGPL-3.0-or-later** across the whole repo. New source files need the
  SPDX header.

## dev commands

```sh
make setup              # docker postgres + elixir deps + db + js deps
make dev                # all four apps concurrently
make sdk.gen            # regenerate SDK type modules from schemas
make sdk.py.test        # 55 pytest unit tests
make sdk.go.test        # 44 go tests
make sdk.rs.test        # 44 rust tests
cd apps/gateway && mix test   # 24 elixir tests
cd apps/web && bun run dev    # marketing site on :5173
cd apps/app && bun run dev    # customer dashboard on :5174
```

Live-gateway integration tests: prefix any of the sdk-* test commands
with `HELA_LIVE=1`. They sign up throwaway accounts against the Railway
production stack.

## if you're starting fresh

1. `cd /Users/v0id/Desktop/Personal/hela`
2. `git pull origin main` — should be clean, on `main`, at `1df19bf` or newer
3. Read this file, `CLAUDE.md`, and `docs/architecture.md` in that order
4. Check CI state: `gh run list --limit 3 --branch main --workflow ci.yml`
5. If there's a pending prod deploy, approve it:
   ```sh
   RUN_ID=$(gh run list --limit 1 --branch main --workflow ci.yml --json databaseId -q '.[0].databaseId')
   gh api -X POST repos/v0id-user/hela/actions/runs/$RUN_ID/pending_deployments \
     --input - <<EOF
   {"environment_ids":[14518792549],"state":"approved","comment":"admin bypass"}
   EOF
   ```
   (Repeat once per `deploy-*` job in the run — typically 4 times.)
6. Pick up at **"P0 — not yet done"** above.

## memory notes

Session used up tokens on:
- 30+ commits across SDK scaffolding, tests, docs, CI
- Multiple rounds of fixing hela.dev references (should have been caught
  in one pass — see `grep -rn 'hela\.dev'` before commits)
- Region rename iterations (fra → ams → double-checking every SDK)

Main takeaways for the next session to be faster:
- Do one big `grep` sweep for any shared substring at the START of a
  multi-file rename, not after each edit batch
- Always check `gh run view` on the most-recent run before writing code
  that might conflict with an in-flight CI run
- The preview server in `.claude/launch.json` is named `web` and `app`
  — `preview_start` them to render changes
