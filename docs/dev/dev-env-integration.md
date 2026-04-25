# dev environment integration test, the spec

This document is the **specification** for how hela exercises auth and
billing logic end to end against a real running stack before any
change merges to `main`. It is normative, not aspirational — the test
described here is the gate that protects production.

If you change anything in `apps/control/lib/control/accounts*`,
`apps/control/lib/control/billing*`, `apps/control/lib/control_web/controllers/auth_controller.ex`,
or any flow that ultimately creates or mutates a Polar customer or
subscription, you must run this test against the dev plane and post
its output in the PR before requesting merge. CI not having a job for
this yet is not an excuse to skip — run it locally against dev.

## What "dev" means here

Two things, both with the same name on purpose:

1. **The `dev` git branch** — long lived, sibling of `main`. Every
   change destined for production lands here first via a feature
   branch → `dev` PR. Railway's GitHub integration deploys `dev`
   pushes to the **dev** Railway environment.
2. **The `dev` Railway environment** — the second environment in the
   `hela` Railway project (id `ca81e3ec-1685-4fbf-bb23-c7336f9a79a0`).
   Has its own postgres, gateway, control, web, app instances with
   distinct URLs, and is wired to the **sandbox** Polar org
   (`6f6a5c08-5439-429e-9a17-0dcb6e587412` on `sandbox-api.polar.sh`).
   See [`infra/railway/README.md`](../../infra/railway/README.md) for
   the variable matrix.

The dev Railway env is the **only** place hela's auth and billing
flows are exercised end to end without touching production data.
Local `mix test` and Vitest catch unit bugs; dev-env integration
catches wiring bugs (CORS, cookies, Polar HTTP, env var typos, JSON
serialization, schema migration drift).

## Test scope

### Required cases

The test must exercise, in order, on a fresh anonymous run:

1. **Signup creates a control-plane account.**
   `POST {DEV_CONTROL_URL}/auth/signup` with a unique email + ≥8-char
   password returns 200, sets a session cookie, returns
   `{ account: { id, email, polar_customer_id, github_id } }`.
2. **Signup creates a Polar customer in sandbox.**
   The account's `polar_customer_id` field is non-null and matches a
   real customer fetched via
   `GET https://sandbox-api.polar.sh/v1/customers/{polar_customer_id}`
   using the sandbox `POLAR_ACCESS_TOKEN`. The customer's `email`
   matches the signup email.
3. **`/api/me` returns the same account with the session cookie.**
4. **Wrong password returns 401.**
   `POST /auth/login` with the right email and a wrong password
   returns 401 with `{ error: "invalid_credentials" }` and no session
   cookie change.
5. **Right password returns 200 and refreshes the session.**
6. **Logout drops the session.**
   `POST /auth/logout` clears the cookie; a subsequent
   `GET /api/me` returns 401.

### Cleanup

After all cases run, the test deletes the created Polar customer in
sandbox (`DELETE /v1/customers/{id}`) and the control-plane account
row. The dev DB is not a long-lived data store; leaving rows behind
is allowed if cleanup fails, but the test must report it.

### Out of scope (today)

- Project create / Polar subscription start. Add a case for it the
  moment we wire backend project creation to `/api/projects`.
- Webhook delivery (Polar → control). Tested manually via Polar CLI
  forwarder for now.
- GitHub OAuth signup. Test it the moment that path lands.

## Inputs

The test reads from `.env.local` at repo root (gitignored). Required
keys:

| key | source |
| --- | --- |
| `DEV_CONTROL_URL` | Output of `railway variables --service control --environment dev` (or the dev env service domain) |
| `DEV_POLAR_ACCESS_TOKEN` | Sandbox Polar org access token (`SANDBOX_POLAR_ACCESS_TOKEN` in `.env.local` already) |
| `DEV_POLAR_ORG_ID` | Sandbox org id, currently `6f6a5c08-5439-429e-9a17-0dcb6e587412` |

If any are missing the test exits non-zero with a clear "missing env"
message, not a partial run.

## Run

```sh
bun run scripts/dev_integration_test.ts
```

Exit code 0 = pass; non-zero = fail. The script prints one line per
test case (`pass`/`fail`/`skip` + a short reason) and a final
summary. The Polar customer id created is printed so you can find it
in the sandbox dashboard if you want to inspect it.

## Pass criteria

- All required cases report `pass`.
- The final summary prints `dev integration: ok`.
- No leftover state in sandbox Polar (customer was deleted) or, if
  cleanup failed, the script names what was left behind.

## When to run

- **Before opening a PR to `main`** that touches any path listed at
  the top of this document.
- **After every Polar variable change on the dev env** (rotated
  token, new product id, new webhook secret).
- **Anytime the dev Railway env redeploys** with a control or
  gateway change (auto-deploys from `dev` branch pushes).

CI will eventually run this on every push to `dev`. Until then it's
manual; that's the trade-off for moving fast.

## When the test fails

- **Polar 4xx on customer fetch** — usually a token mismatch. Check
  `railway variables --service control --environment dev` against the
  `SANDBOX_POLAR_*` block in `.env.local`.
- **Signup 500** — check `railway logs --service control --environment dev`.
  Most common: `POLAR_ACCESS_TOKEN` unset (control no-ops Polar but
  still inserts the account, leaving `polar_customer_id` null and
  failing case 2). Re-run after seeding vars.
- **CORS error in browser flow** — `ALLOWED_ORIGINS` on the dev
  control service does not include the dev app URL. See the env var
  matrix in [`infra/railway/README.md`](../../infra/railway/README.md).
- **Session cookie not set** — confirm the dev control responds
  `Set-Cookie: _control_key=...; SameSite=None; Secure` on a `:prod`
  build. Mix env determines this at compile time, so a `:dev` build
  deployed accidentally to dev Railway env will issue Lax cookies and
  break cross-origin browser flow (the curl-based integration test
  still passes because curl doesn't enforce SameSite).

Keep this list growing. Every new failure mode the test catches gets
a paragraph here so the next person doesn't rediscover it.
