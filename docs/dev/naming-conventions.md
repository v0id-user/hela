# naming conventions

Per-language naming rules detected by inspecting this repo. These
match what the code already does, not what an external style guide
would recommend.

If a language section says "the repo is inconsistent here", that
means the next contributor must pick one and migrate the rest. Do
not introduce a third pattern.

## global

- Subjects in commit messages match `^[A-Za-z0-9 ,:]{4,72}$`. No
  parens, no hyphens, under 72 chars. See
  `scripts/check-commit-msg.sh`.
- File slugs in `.cursor/plans/` use snake_case with a trailing
  hash, e.g. `ephemeral_demo_mode_627c9e63.plan.md`.

## elixir

Files and folders follow Phoenix convention:

- One module per file.
- File path mirrors module name. `Control.Accounts.APIKey` lives
  at `apps/control/lib/control/accounts/api_key.ex`. Nested
  modules go in nested directories.
- Test files mirror the source path under `test/` and end in
  `_test.exs`. Function names start with `test "..."`.

Modules:

- App namespace is the OTP app name in PascalCase: `Hela` for
  gateway, `Control` for control plane.
- Web modules under `<App>Web.*` (`HelaWeb`, `ControlWeb`).
- Generated/wrapper modules end in their role:
  `*.Application`, `*.Repo`, `*.Endpoint`, `*.Telemetry`,
  `*.Release`, `*.Channels`, `*.Cache`, `*.Pipeline`.

Functions, variables, atoms:

- `snake_case` for function and variable names.
- `:snake_case` for atoms used as keys or status codes.
- Predicate functions end in `?`: `ephemeral?(socket)`.
- Bang functions end in `!`: `Channels.publish!`. Bang means
  "raises on failure"; non-bang returns `{:ok, _} | {:error, _}`.

Ecto:

- Schemas are `Control.Accounts.Project`, plural-by-context, but
  the table name is the singular `projects`. Match Phoenix gen.
- Field names: `snake_case`, fully spelled, no abbreviations.
  `polar_customer_id`, `polar_subscription_id`, `last_used_at`,
  `revoked_at`. Past historical drift left `stripe_*` fields
  that were renamed in this session; do not reintroduce.
- Migrations are timestamped: `priv/repo/migrations/<YYYYMMDDHHMMSS>_<slug>.exs`.

Errors and logs:

- Tagged tuples for return values: `{:ok, term}` and
  `{:error, atom_or_struct}`.
- `Logger.error/2` for unexpected, `Logger.warning/2` for
  recoverable, `Logger.info/2` for state transitions.
- Log key/value pairs use `snake_case` field keys:
  `Logger.info("polar sub canceled", sid: sid)`.

## typescript

Files and folders:

- React components: `PascalCase.tsx`, one default-or-named export
  per file. Examples: `Hero.tsx`, `Pricing.tsx`,
  `RegionPicker.tsx`.
- Routes mirror component naming. Under `apps/app/src/routes/`:
  `Billing.tsx`, `ProjectList.tsx`.
- Library / utility files: `camelCase.ts` or descriptive
  lowercase. SDK source is `client.ts`, `transport.ts`,
  `presence.ts`.
- Test files end in `.spec.ts` and live next to the code or in
  `tests/`.

Types and interfaces:

- `PascalCase`. Prefer `interface` for object shapes that may be
  extended, `type` for unions and aliases.
- Wire types live in `packages/sdk-types/src/` and are generated
  from `packages/schemas/openapi.yaml`. Do not hand-edit the
  generated module.
- Augmentations to `Window` are declared via `declare global { interface Window { ... } }`,
  in a `types/globals.d.ts` for the package. See
  `packages/sdk-js-e2e/types/globals.d.ts`.

Functions and variables:

- `camelCase` for functions, methods, and variables.
- `UPPER_SNAKE_CASE` for module-level constants like
  `TIER_PRICE`, `DEFAULT_GATEWAY_URL`.
- Booleans read as predicates: `isSignedIn`, `connected`,
  `ephemeral`.
- Async functions are awaited or returned, never fired and
  forgotten without a comment explaining why.

## python

Files and folders:

- `snake_case.py`. Underscore prefix for private modules:
  `_transport.py`, `_generated/`.
- Test files: `test_<thing>.py`, in `tests/`.

Modules and packages:

- Package is `hela` under `packages/sdk-py/src/hela/`.
- Modules are `client.py`, `channel.py`, `presence.py`,
  `errors.py`, `rest.py`. Hand-written. Generated wire types are
  under `_generated/`, never hand-edited.

Names:

- `snake_case` for functions, variables, methods.
- `PascalCase` for classes, including Pydantic models.
- `UPPER_SNAKE_CASE` for module-level constants.
- Predicate functions return `bool` and read as predicates:
  `is_ephemeral`, `connected`.

Errors:

- One error class per failure mode in `errors.py`. All inherit
  from a base `HelaError`.
- Pydantic v2 `ValidationError` is allowed to bubble for input
  errors at the boundary; everything internal raises a `HelaError`
  subclass.

## go

Files and folders:

- `snake_case.go` if the file owns one logical unit
  (`channel.go`, `presence.go`), single-word lowercase otherwise
  (`client.go`).
- Test files end in `_test.go`, in the same package.

Names:

- `PascalCase` for exported, `camelCase` for unexported.
- Type names are short nouns: `Client`, `Channel`, `Presence`,
  `TokenRequest`. Avoid stutter: `client.Client` is fine, but
  `client.ClientOptions` is not. Use `client.Options`.
- Errors: package-level sentinel errors named `ErrFoo`. Wrap with
  `fmt.Errorf("...: %w", err)`.

Tests:

- Test functions: `func TestThing(t *testing.T)`.
- Subtests via `t.Run("descriptive name", func(t *testing.T) {...})`.

## rust

Files and folders:

- `snake_case.rs`. One concept per file: `client.rs`,
  `channel.rs`, `presence.rs`, `transport.rs`, `types.rs`,
  `rest.rs`, `errors.rs`.
- Tests in `tests/` for integration, `mod tests` inside `lib.rs`
  / module file for unit.

Names:

- `PascalCase` for types, traits, enums.
- `snake_case` for functions, methods, variables, modules.
- `SCREAMING_SNAKE_CASE` for constants.
- Sentinel errors: enum variants on a single `Error` type per
  module. Use `thiserror` if available. Wrap external errors via
  `From` impls.

Serde:

- `#[serde(skip_serializing_if = "serde_skip_false")]` for
  optional booleans that should omit from JSON when false. See
  `packages/sdk-rs/src/types.rs`.

## terraform / hcl

- Resources named after the thing they create:
  `railway_service.gateway`, `railway_volume` (nested block on the
  service), `random_password.gateway_secret_key_base`.
- Variables `snake_case` in `variables.tf`.
- Outputs `snake_case` in `outputs.tf`.
- One `*.tf` file per concern: `main.tf`, `variables.tf`,
  `outputs.tf`, `providers.tf`, `secrets.tf`.

## environment variables

`SCREAMING_SNAKE_CASE` everywhere. Conventions by audience:

- `HELA_*`, configuration consumed by the app code itself
  (`HELA_REGION`, `HELA_LIVE`, `HELA_API_KEY`, `HELA_E2E_BASE_URL`).
- `RAILWAY_*`, injected by the Railway runtime
  (`RAILWAY_PRIVATE_DOMAIN`, `RAILWAY_PRIVATE_IP`,
  `RAILWAY_DOCKERFILE_PATH`).
- `POLAR_*`, billing platform secrets and product ids
  (`POLAR_ACCESS_TOKEN`, `POLAR_PRODUCT_STARTER`).
- `VITE_*`, build-time config baked into the static bundle
  (`VITE_HELA_API`, `VITE_HELA_GATEWAY`).
- `GATEWAY_INTERNAL_SECRET`, shared secret for `/_internal/*`
  endpoints between control and gateway.
- `PHX_*`, Phoenix runtime config (`PHX_SERVER`, `PHX_HOST`).
- `GITHUB_SHA`, set by GitHub Actions, also forwarded by CI into
  the build step so `prepare_static_assets.ts` can stamp it into
  `version.json`.

Rule going forward: when adding a new env var, prefix it with the
audience or service it is for, not the language it is read from.

## API routes and payload fields

- REST routes are kebab-case under a versioned root: `/v1/tokens`,
  `/v1/projects/<id>`, `/playground/token`. Internal routes under
  `/_internal/*`.
- Payload field names are `snake_case`: `project_id`,
  `expires_in`, `polar_customer_id`, `last_used_at`. The OpenAPI
  spec at `packages/schemas/openapi.yaml` is the source of truth.
- WebSocket frame shape is Phoenix Channel v2:
  `[join_ref, ref, topic, event, payload]`.

## feature flags

There are no global feature flags in the codebase today. Per-token
behavior is encoded in the JWT claims (`ephemeral: true|false`,
the canonical example). When a future flag is added, name it
`HELA_FLAG_<SLUG>` if env-driven, or as a JWT claim if
per-request.

## the parts of the repo that are inconsistent

- TypeScript file naming inside `packages/sdk-js/src/` mixes
  `client.ts` (concept) and `index.ts` (entry point). Both are
  acceptable; the entry-point file is always `index.ts`.
- A few helper scripts use `.mjs`. These should migrate to
  TypeScript via `bun run`. Tracked as a low-priority cleanup, no
  PR yet.
