# runbook

Playbook for ops scenarios. Keep this short; anything that appears here
more than twice should become an alert.

## current Railway inventory (testing phase)

Refresh from repo root:

```sh
railway status --json
```

Snapshot captured 2026-04-24:

- `production` environment: `6fb79cd1-6483-42ac-908d-29be10e8e314`
- `dev` environment: `ca81e3ec-1685-4fbf-bb23-c7336f9a79a0`
  - currently empty: no service instances yet
- `gateway` service `7f7dd41d-43bb-4c7a-92b8-c372ef01a044`
  - `https://gateway-production-bfdf.up.railway.app`
- `control` service `d47abc5c-f6dd-4923-afc5-36ce799c4145`
  - `https://control-production-059e.up.railway.app`
- `app` service `387e5f18-c2b7-43a1-8677-46eb469ad212`
  - `https://app-production-1716a.up.railway.app`
- `web` service `2e0ecb92-1b72-4f37-8efb-98549051ed7c`
  - `https://web-production-f24fc.up.railway.app`

Temporary testing-phase hosted schemas live under:

- `https://web-production-f24fc.up.railway.app/schemas/wire/`

Once the real domain is bought, update the Railway env vars, SDK region
maps, web meta tags, hosted schema path, and the schema `$id` values in
`packages/schemas/wire/`.

## a region is down

1. Check Railway service status:
   `railway status --service gateway --environment production`.
2. If the service is up but metrics stopped:
   `railway logs --service gateway --environment production`.
   Almost always either Postgres unreachable or BEAM distribution
   bounce.
3. Redeploy the region: `railway redeploy --service gateway
   --environment production --yes`. Dashboard → service → rollback
   to a specific deployment if the bad commit isn't obvious from
   the logs.
4. If Postgres is the problem, pull the `DATABASE_URL` env var from
   the gateway service and `psql "$DATABASE_URL"`; check connection
   count + locks from there.

Customers on single-region projects see a hard outage during the
redeploy (~15-30 s on Railway). Multi-region replication is not
live today — all production traffic lands on the single `ams`
gateway until the `iad`, `sjc`, `sin`, `syd` slugs get real
services (see `RESUME.md` → P1).

## a JWK didn't propagate

Control pushed an upsert, gateway didn't ack. Check control's logs
for the warning; the `Control.Sync` call returns `{:error, ...}`
and the mutation in control's DB proceeds anyway (we favour
availability over strict sync).

To reconcile manually:

```sh
railway ssh --service control --environment production
# then inside the container:
bin/control remote
> Control.Accounts.get_project("proj_xyz") |> Control.Sync.push_project()
```

## polar webhook stopped firing

1. Check the signing secret matches on the control service:
   `railway variables --service control --environment production`
   (look for `POLAR_WEBHOOK_SECRET`).
2. Trigger a test event from the Polar dashboard → Webhooks → the
   endpoint pointed at `<control-url>/webhooks/polar`. The dashboard
   surfaces the HMAC comparison on delivery failure.
3. If signature verification is the issue it's usually a trailing
   newline that got pasted into the secret. Rotate the webhook
   secret in Polar, copy the new value, and `railway variables --set
   POLAR_WEBHOOK_SECRET=...` on the control service.

## someone's over their monthly cap and complaining

Check their usage:

```sh
# Pull the gateway's DATABASE_URL from Railway, then open psql:
export PGURL=$(railway variables \
  --service gateway --environment production --json \
  | jq -r .DATABASE_URL)
psql "$PGURL" -c "select * from usage_daily \
  where project_id = 'proj_xyz' order by date desc limit 30;"
```

Over-cap publishes aren't rejected — they're delivered with an
`over_quota` flag on the reply and metered into Polar for overage.
If the customer didn't notice, the dashboard usage chart should
have been screaming amber; link them to it.

## rolling back a bad gateway deploy

Railway keeps every deployment. To revert:

```sh
# List recent deployments for the gateway service (most-recent first).
railway status --service gateway --environment production --json \
  | jq '.latestDeployments // .deployments'

# Roll back via the dashboard → service → deployments → pick a
# previous successful one → Redeploy. There is no stable CLI
# rollback command today; `railway redeploy` always fires the
# latest commit.
```

Each `deploy-*` CI job now gates on `/health` for up to 5 minutes,
so a broken build fails CI and won't replace the good image. If a
deploy still made it through and is now misbehaving, roll it back
manually from the dashboard while the next fix PR works through
CI. Gateway deploys are per-service, so rolling back gateway
doesn't affect control / app / web.

## bringing up a new region

See `infra/terraform/README.md` — step-by-step.
