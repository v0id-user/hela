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

1. Check Fly status: `flyctl status --app hela-gateway-<region>`.
2. If machines are fine but metrics stopped: `flyctl logs --app ...`.
   Almost always either Postgres unreachable or BEAM distribution bounce.
3. Restart the region's machines: `flyctl machine restart --app ...`.
4. If Postgres is the problem, `flyctl postgres connect -a hela-gw-db-<region>`
   and check connection count / locks.

Customers on single-region projects see a hard outage during the restart
(~15s). Scale-tier projects with multi-region replication keep working
in peer regions; their traffic routes via the SDK's region failover
(v1.1 — flag in `HelaConfig.fallback_regions`).

## a JWK didn't propagate

Control pushed an upsert, gateway didn't ack. Check control's logs for
the warning; the Sync call returns `{:error, ...}` and the mutation in
control's DB proceeds anyway (we favour availability over strict sync).

To reconcile manually:

```
flyctl ssh console --app hela-control
bin/control remote
> Control.Accounts.get_project("proj_xyz") |> Control.Sync.push_project()
```

## stripe webhook stopped firing

1. Check signing secret matches: `flyctl secrets list --app hela-control`.
2. Test the endpoint directly:
   `stripe trigger invoice.payment_succeeded`.
3. If signature verification is the issue, the Stripe CLI shows exact
   comparisons; usually a trailing newline got into the secret.

## someone's over their monthly cap and complaining

Check their usage:

```
flyctl postgres connect -a hela-gw-db-<their-region>
select * from usage_daily where project_id = 'proj_xyz' order by date desc limit 30;
```

Over-cap publishes aren't rejected — they're delivered with an
`over_quota` flag on the reply and metered into Stripe for overage. If
the customer didn't notice, the dashboard usage chart should have been
screaming amber; link them to it.

## rolling back a bad gateway deploy

```
flyctl releases --app hela-gateway-iad
flyctl deploy --image <previous-image-ref> --app hela-gateway-iad
```

Gateway deploys are one-region-at-a-time. If the region that rolled is
the only broken one, rollback just that region and investigate before
proceeding. CI workflow blocks on the current region before the next
fires.

## bringing up a new region

See `infra/terraform/README.md` — step-by-step.
