# hela/infra/railway

Terraform owns the **structure** of the Railway project: services,
postgres image + volume, public domains, GitHub source linkage. It
does **not** own variable values — those are seeded per environment
via the `railway` CLI. This split keeps the production and dev
environments free to point at different Polar orgs (and hold
different secrets) without warping the Terraform graph into a
per-env module.

If you change variable shape (add a new var name, remove one), this
README is the source of truth — update it, then update the running
environments via the CLI commands below.

## Prerequisites

- [Terraform](https://developer.hashicorp.com/terraform/downloads) ≥ 1.7
- [`railway` CLI](https://docs.railway.com/guides/cli)
- A Railway **team** token at [railway.com/account/tokens](https://railway.com/account/tokens).
  Project-scoped tokens can't create services.
- A Polar organization for each environment you plan to run (the
  hosted plane runs **two**: production on `api.polar.sh`, sandbox on
  `sandbox-api.polar.sh`).

## First-time setup

```sh
cd infra/railway
cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars and fill in workspace_id

export RAILWAY_TOKEN=$(pbpaste)
terraform init
terraform plan
terraform apply
```

`terraform apply` prints the project id, service ids, and the
generated random secrets. Capture the outputs:

```sh
terraform output -json > outputs.json   # gitignored
```

Then seed the variables for each environment (next section).

## Environment variable matrix

This is the canonical list of variables every service expects. The
**dev** column shows what to set on the Railway `dev` environment;
**production** shows what differs.

### `postgres` service

| variable | dev | production | notes |
| --- | --- | --- | --- |
| `POSTGRES_USER` | `hela` | `hela` | static |
| `POSTGRES_PASSWORD` | (gen) | (gen) | from `terraform output -json generated_secrets` |
| `POSTGRES_DB` | `hela` | `hela` | static |
| `PGDATA` | `/var/lib/postgresql/data/pgdata` | same | subdir of mount; see `docs/dev/environment.md` |
| `POSTGRES_INITDB_ARGS` | `--data-checksums` | same | static |

### `gateway` service

| variable | dev | production | notes |
| --- | --- | --- | --- |
| `PHX_SERVER` | `true` | `true` | static |
| `HELA_REGION` | `ams` | `ams` | one gateway today; add per-region values when you split |
| `HELA_WEB_HOST` | dev web public host | prod web public host | **required** — gateway's WebSocket `check_origin` allowlist; defaults in `runtime.exs` are production-only, so dev needs this overridden or browsers from dev/web get handshake-rejected (reconnect storm) |
| `HELA_APP_HOST` | dev app public host | prod app public host | **required** — same as above for the dashboard's WebSocket connections |
| `DATABASE_URL` | `ecto://hela:<pw>@postgres.railway.internal:5432/hela` | same | uses internal DNS |
| `PHX_HOST` | gateway public domain | same | from `terraform output urls.gateway` (strip `https://`) |
| `PORT` | `4000` | `4000` | static |
| `POOL_SIZE` | `10` | `10` | static |
| `ECTO_IPV6` | `1` | `1` | required on Railway |
| `SECRET_KEY_BASE` | (gen) | (gen) | distinct per env; from `gateway_secret_key_base` output |
| `PLAYGROUND_SECRET` | (gen) | (gen) | shared symmetric key for playground JWT |
| `GATEWAY_INTERNAL_SECRET` | (gen) | (gen) | shared with control |
| `RAILWAY_DOCKERFILE_PATH` | `apps/gateway/Dockerfile` | same | static |

### `control` service

| variable | dev | production | notes |
| --- | --- | --- | --- |
| `PHX_SERVER` | `true` | `true` | static |
| `DATABASE_URL` | same as gateway | same | shared postgres |
| `PHX_HOST` | control public domain | same | strip `https://` |
| `PORT` | `4000` | `4000` | static |
| `POOL_SIZE` | `10` | `10` | static |
| `ECTO_IPV6` | `1` | `1` | static |
| `SECRET_KEY_BASE` | (gen) | (gen) | from `control_secret_key_base` output |
| `GATEWAY_INTERNAL_SECRET` | same as gateway | same | shared |
| `GATEWAYS` | `{"iad":"https://...","ams":"https://...",...}` | same | json map; one entry per region today |
| `ALLOWED_ORIGINS` | `https://app.<dev-suffix>.up.railway.app` | `https://app-production-...up.railway.app` | comma-separated; required for credentialed CORS |
| `POLAR_ENV` | `sandbox` | `production` | drives the Polar API host |
| `POLAR_ACCESS_TOKEN` | sandbox `polar_oat_...` | production `polar_oat_...` | from each Polar org's API key page |
| `POLAR_ORG_ID` | sandbox org uuid | production org uuid | |
| `POLAR_WEBHOOK_SECRET` | sandbox `polar_whs_...` | production `polar_whs_...` | from each org's webhook endpoint config |
| `POLAR_PRODUCT_STARTER` | sandbox starter product id | production starter id | catalog ids do not port across orgs; see [`docs/hosted-plans/`](../../docs/hosted-plans/) |
| `POLAR_PRODUCT_GROWTH` | sandbox growth id | production growth id | |
| `POLAR_PRODUCT_SCALE` | sandbox scale id | production scale id | |
| `RAILWAY_DOCKERFILE_PATH` | `apps/control/Dockerfile` | same | static |

### `web` service (marketing)

| variable | dev | production | notes |
| --- | --- | --- | --- |
| `PORT` | `80` | `80` | nginx static container |
| `VITE_HELA_API` | gateway public URL | same | baked into bundle at build time |
| `RAILWAY_DOCKERFILE_PATH` | `apps/web/Dockerfile` | same | static |

### `app` service (dashboard)

| variable | dev | production | notes |
| --- | --- | --- | --- |
| `PORT` | `80` | `80` | nginx static container |
| `VITE_HELA_CONTROL` | control public URL | same | baked into bundle |
| `VITE_HELA_GATEWAY` | gateway public URL | same | baked into bundle |
| `RAILWAY_DOCKERFILE_PATH` | `apps/app/Dockerfile` | same | static |

## Seeding a fresh environment

`railway` CLI mutates the linked project + environment + service. The
shape of every command is:

```sh
railway variable set \
  --service <service> \
  --environment <production|dev> \
  --skip-deploys \
  'KEY=value' 'KEY2=value2' ...
```

`--skip-deploys` batches changes; trigger one explicit redeploy at
the end with `railway redeploy --service <service>`.

To seed everything for one environment:

```sh
ENV=dev   # or production

# pull secrets (after terraform apply)
DB_PW=$(terraform output -json generated_secrets | jq -r .postgres_password)
SKB_GW=$(terraform output -json generated_secrets | jq -r .gateway_secret_key_base)
SKB_CTL=$(terraform output -json generated_secrets | jq -r .control_secret_key_base)
PLAYG=$(terraform output -json generated_secrets | jq -r .playground_secret)
INTERNAL=$(terraform output -json generated_secrets | jq -r .internal_secret)

# pull URLs
GW_HOST=$(terraform output -json urls | jq -r .gateway | sed 's|https://||')
CTL_HOST=$(terraform output -json urls | jq -r .control | sed 's|https://||')
APP_URL=$(terraform output -json urls | jq -r .app)

# postgres
railway variable set --service postgres --environment $ENV --skip-deploys \
  "POSTGRES_USER=hela" "POSTGRES_PASSWORD=$DB_PW" "POSTGRES_DB=hela" \
  "PGDATA=/var/lib/postgresql/data/pgdata" "POSTGRES_INITDB_ARGS=--data-checksums"

# gateway
railway variable set --service gateway --environment $ENV --skip-deploys \
  "PHX_SERVER=true" "HELA_REGION=ams" \
  "HELA_WEB_HOST=$([ "$ENV" = "production" ] && echo web-production-f24fc.up.railway.app || echo web-dev-dev-881b.up.railway.app)" \
  "HELA_APP_HOST=$([ "$ENV" = "production" ] && echo app-production-1716a.up.railway.app || echo app-dev-dev-4b3a.up.railway.app)" \
  "DATABASE_URL=ecto://hela:$DB_PW@postgres.railway.internal:5432/hela" \
  "PHX_HOST=$GW_HOST" "PORT=4000" "POOL_SIZE=10" "ECTO_IPV6=1" \
  "SECRET_KEY_BASE=$SKB_GW" "PLAYGROUND_SECRET=$PLAYG" \
  "GATEWAY_INTERNAL_SECRET=$INTERNAL" \
  "RAILWAY_DOCKERFILE_PATH=apps/gateway/Dockerfile"

# control (the polar block has to be filled in by hand per env)
railway variable set --service control --environment $ENV --skip-deploys \
  "PHX_SERVER=true" \
  "DATABASE_URL=ecto://hela:$DB_PW@postgres.railway.internal:5432/hela" \
  "PHX_HOST=$CTL_HOST" "PORT=4000" "POOL_SIZE=10" "ECTO_IPV6=1" \
  "SECRET_KEY_BASE=$SKB_CTL" "GATEWAY_INTERNAL_SECRET=$INTERNAL" \
  "GATEWAYS={\"iad\":\"https://$GW_HOST\",\"sjc\":\"https://$GW_HOST\",\"ams\":\"https://$GW_HOST\",\"sin\":\"https://$GW_HOST\",\"syd\":\"https://$GW_HOST\"}" \
  "ALLOWED_ORIGINS=$APP_URL" \
  "RAILWAY_DOCKERFILE_PATH=apps/control/Dockerfile"

# polar — different values per env (sandbox vs production org)
railway variable set --service control --environment $ENV --skip-deploys \
  "POLAR_ENV=$( [ "$ENV" = "production" ] && echo production || echo sandbox )" \
  "POLAR_ACCESS_TOKEN=polar_oat_..." \
  "POLAR_ORG_ID=..." \
  "POLAR_WEBHOOK_SECRET=polar_whs_..." \
  "POLAR_PRODUCT_STARTER=..." \
  "POLAR_PRODUCT_GROWTH=..." \
  "POLAR_PRODUCT_SCALE=..."

# web
railway variable set --service web --environment $ENV --skip-deploys \
  "PORT=80" "VITE_HELA_API=https://$GW_HOST" \
  "RAILWAY_DOCKERFILE_PATH=apps/web/Dockerfile"

# app
railway variable set --service app --environment $ENV --skip-deploys \
  "PORT=80" "VITE_HELA_CONTROL=https://$CTL_HOST" \
  "VITE_HELA_GATEWAY=https://$GW_HOST" \
  "RAILWAY_DOCKERFILE_PATH=apps/app/Dockerfile"

# trigger one redeploy per service
for svc in postgres gateway control web app; do
  railway redeploy --service "$svc" --environment "$ENV" --yes
done
```

Polar product ids per env are documented in
[`docs/hosted-plans/`](../../docs/hosted-plans/) — each per-tier file
lists both the production and sandbox ids.

## Adopting an existing project

If a Railway project already exists (the original hand-rolled one
this repo was first deployed into), `terraform import` each
resource rather than re-creating:

```sh
terraform import railway_project.hela 98c482c8-a446-4dc6-88fb-d3a49353d2d2
terraform import railway_service.postgres b17e09c8-d0db-49ae-a055-393e5b87198d
terraform import railway_service.gateway  7f7dd41d-43bb-4c7a-92b8-c372ef01a044
terraform import railway_service.control  d47abc5c-f6dd-4923-afc5-36ce799c4145
terraform import railway_service.web      2e0ecb92-1b72-4f37-8efb-98549051ed7c
terraform import railway_service.app      387e5f18-c2b7-43a1-8677-46eb469ad212
```

Then run `terraform plan` and expect drift on service config (Railway
defaults vs what's in main.tf). Reconcile until plan is clean. Variable
state is **not** in Terraform anymore so it won't show as drift here.

## Destroying

```sh
terraform destroy
```

Wipes the project, all services, all data. Don't run against production
without confirming the project name in the plan output. Variable
values disappear with the services — back them up via
`railway variables --service <s> --environment <e> --kv` first if you
care.

## Files

| file                       | purpose                                          |
| -------------------------- | ------------------------------------------------ |
| `providers.tf`             | provider pinning + auth                          |
| `variables.tf`             | inputs (project name, workspace, github repo)    |
| `secrets.tf`               | generated random secrets, exposed as outputs    |
| `main.tf`                  | project, services, postgres volume, domains      |
| `outputs.tf`               | URLs, service ids, generated secrets             |
| `terraform.tfvars.example` | fill-in template                                 |
