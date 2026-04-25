# dev docs

Engineering reference for contributors and AI agents. Skim
`CLAUDE.md` at the repo root first, then come here for depth.

Read top to bottom in under two minutes.

## what each file covers

- **`mistakes.md`**, the post-mortem log. Concrete incidents from
  prior sessions, with root cause and the rule going forward.
  Read this before you make a similar change. Categories:
  assumptions about the codebase, environment drift, invented
  references, ignoring patterns, over/under-engineering, process
  mistakes, communication mistakes.
- **`development-cycle.md`**, the actual loop a contributor follows.
  Start a task, get the repo runnable from cold, run the service,
  run tests, run lint and typecheck, validate, open a PR, handle
  conflicts, roll back. Picks one canonical path when the repo has
  several.
- **`naming-conventions.md`**, per-language naming rules detected by
  inspecting the repo. Covers Elixir, TypeScript, Python, Go, Rust,
  HCL/Terraform. If the repo is inconsistent, the file says so and
  picks the winning convention.
- **`code-quality.md`**, the rules that turn "it works locally" into
  "it shipped". Configuration, error handling, dead code,
  dependency pinning, public API surface. Each rule is either
  enforced by tooling, checked in review, or marked judgment call.
- **`testing.md`**, the test pyramid as it actually exists here.
  Where unit, integration, and Playwright tests live, how fixtures
  work, how external dependencies are stood up, what coverage rule
  applies, and the flaky-test policy.
- **`environment.md`**, what is needed to reproduce the runtime
  bit-for-bit. Pinned versions, package managers, system
  dependencies, every environment variable, secrets handling,
  common setup failures.
- **`pitfalls.md`**, sharp edges. Performance gotchas, library
  quirks, ordering dependencies, places where the obvious solution
  is wrong. Includes a brief incident summary for anything that
  caused production pain.

## when to read what

- **Cold start on the repo:** `CLAUDE.md`, then `environment.md`,
  then `development-cycle.md`. You should be able to run `mix test`
  in the gateway and `bun run test:e2e` in `packages/sdk-js-e2e`
  after that.
- **About to edit a file you have not touched before:** skim
  `naming-conventions.md` for the language, then read the file end
  to end before editing.
- **About to push:** `code-quality.md` and the "before you commit"
  list in `CLAUDE.md`.
- **About to run a destructive op (volume delete, force-push, drop
  table):** read the relevant entry in `mistakes.md` first.
- **Diagnosing a flake or weird behavior:** `pitfalls.md` first,
  then `testing.md`.
