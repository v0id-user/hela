# Contributing to hela

Thanks for looking at the code. hela is an open source project
first: the goal is a credible, inspectable alternative to closed
cloud realtime, with clear docs and a codebase contributors can
navigate. Please read this before sending a PR, and keep
signal-to-noise high so the project stays maintainable as it grows.

## Development environment

Pinned versions in `.tool-versions` (readable by [mise](https://mise.jdx.dev),
[asdf](https://asdf-vm.com)). Install them however you like:

- Elixir `1.17.3`, Erlang/OTP `27.1.2`
- Bun `1.1.34+`
- Python `3.13+` (for `scripts/e2e.py`)
- Docker (for local Postgres)
- `uv` (PEP 723 one-shot script runner)

```sh
make setup       # start postgres, fetch deps, migrate dbs, bun install
make dev         # all four apps in one terminal (concurrently)
```

## Branches + commits

- Work on feature branches (`feat/<thing>`, `fix/<thing>`, `docs/<thing>`).
- Write commit messages for future you. First line: one concrete sentence
  in present tense ("add per project signing secret", not "fixed stuff"
  or "updated files"). Body: why, any non-obvious context.
- **No force-pushes to `main`.** CI enforces this; branch protection
  rejects it too.

### Commit-message rule

Every commit subject and every PR title must match:

    ^[A-Za-z0-9 ,:]{4,72}$

In plain English: **ASCII only. Letters, digits, spaces, commas, and
colons. 4 to 72 characters.** Unscoped Conventional-Commits prefixes
like `fix:` / `feat:` / `docs:` work. Parens, hyphens, and emoji do
not. The rule exists because:

- All PRs are squash-merged, so the PR title becomes the commit
  subject verbatim. One rule, one enforcement point.
- `git log --oneline` stays legible. Every line is a sentence you
  can actually read.
- No encoding surprises on any terminal, anywhere.

Examples:

    ok:  add per project signing secret
    ok:  fix: rate limit window drift
    ok:  feat: per project signing secret
    ok:  docs: flesh out contributing guide
    bad: fix(auth): JWK rotation         (parens)
    bad: bump deps to 1.17.3             (dots)
    bad: rate-limit the publish path     (hyphen)
    bad: update 🚀                       (non-ASCII)
    bad: x                               (too short)

Bot PRs (Dependabot, etc) are exempted — their generated titles use
shapes we don't impose on humans. Since every PR is squash-merged,
the reviewer rewrites the squash subject at merge time if they want.

Install the local hook so you find out at commit time, not on push:

    make hooks

The same rule runs in CI on every PR — see `.github/workflows/pr-lint.yml`.

## PRs

1. Open from your fork or a topic branch.
2. CI must be green before merge. The pipeline runs:
   - `mix format --check-formatted` on both Elixir apps
   - `mix compile --warnings-as-errors`
   - `mix test` per app
   - `tsc --noEmit` across TS packages
   - build of web + app
   - CodeQL scan
3. At least one approving review from a CODEOWNER.
4. Squash-merge preferred for small changes, rebase for multi-commit
   feature branches where the intermediate commits are meaningful.

## What we take and what we don't

**Happy to take:**
- Bug fixes with reproduction steps
- New SDK features with types + a test in `scripts/sdk_e2e.ts`
- Docs improvements (especially `docs/architecture.md` clarifications)
- Performance work with before/after numbers

**Probably won't take without discussion first (open an issue):**
- New auth modes
- New billing providers (we're on Polar)
- A new region (operational burden)
- Rewrites of any of the five primitives

## Testing

- **Elixir.** `cd apps/<app> && mix test`. New modules that branch or
  carry state want a test. Latency-sensitive code should have a
  benchmark (`Benchee`) in `test/bench/`.
- **TypeScript.** The SDK is covered by the e2e; if you change a public
  type, `scripts/sdk_e2e.ts` should be updated in the same PR.
- **End to end.** `make e2e` (Python) validates the whole stack
  against localhost or a deployed URL. Run it before opening a PR
  that touches auth, channels, or the control-plane sync.

## Security

**Do not open a public issue for vulnerabilities.** See
[SECURITY.md](SECURITY.md) for the private disclosure path.

## Releases

Tags on `main` follow semver. `v0.x.y` is pre-1.0 — wire formats may
break between minors. `v1.0` onwards: the SDK and the REST surface are
considered stable, breaking changes ship on a major.

## Code style

- Elixir: `mix format` is the arbiter. `.formatter.exs` in each app.
- TypeScript: Prettier default, no trailing commas in function args,
  `bunx prettier --check .`.
- No TODO comments without an issue link. `# TODO(#123): ...`.
- Comments explain *why*, not *what*.

## Architecture decisions

Bigger changes get an ADR in `docs/adr/NNNN-<slug>.md` — context,
decision, consequences. See `docs/adr/0001-split-gateway-control.md`
for the format.
