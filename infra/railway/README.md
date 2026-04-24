# hela/infra/railway

Declarative Terraform config for the hela platform on Railway. Provisions:

- 1 Railway project
- 5 services (postgres, gateway, control, web, app)
- Env vars per service, including generated secrets
- Public `.up.railway.app` domains
- GitHub-source integration for auto-deploy on push to `main`

## Prerequisites

- [Terraform](https://developer.hashicorp.com/terraform/downloads) ≥ 1.7
- A Railway **team** token at [railway.com/account/tokens](https://railway.com/account/tokens).
  Project-scoped tokens can't create services — use a team token.
- A Polar sandbox org with 3 products created (see `apps/control/lib/control/billing.ex`)
  and a webhook endpoint pointing at (placeholder for now) the control domain.

## First-time setup

```sh
cd infra/railway
cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars and fill in workspace_id, polar_*, postgres_password

export RAILWAY_TOKEN=$(pbpaste)   # paste your team token
terraform init
terraform plan
terraform apply
```

`terraform apply` prints the 4 public URLs. Copy the `control` URL, go
to Polar's dashboard, create a webhook endpoint at
`<control-url>/webhooks/polar`, copy the signing secret, and re-apply
once with that secret set:

```sh
TF_VAR_polar_webhook_secret=polar_whs_... terraform apply
```

## Deploy the code

Two paths:

### A. GitOps via Railway's GitHub integration (default)

If `github_repo` is set in `terraform.tfvars` (it is by default), Railway
watches the repo and auto-builds + deploys each service on every push
to `main`. Nothing else to do — just push.

### B. Manual `railway up` from your machine or CI

Useful for hot-patches or air-gapped deploys:

```sh
# from repo root
make railway.up.gateway
make railway.up.control
make railway.up.web
make railway.up.app
```

## Adopting an existing project

If you already have a Railway project (e.g. the original hand-rolled
one this repo was first deployed into), `terraform import` each
resource rather than re-creating. Example:

```sh
terraform import railway_project.hela 98c482c8-a446-4dc6-88fb-d3a49353d2d2
terraform import railway_service.postgres b17e09c8-d0db-49ae-a055-393e5b87198d
terraform import railway_service.gateway  7f7dd41d-43bb-4c7a-92b8-c372ef01a044
terraform import railway_service.control  d47abc5c-f6dd-4923-afc5-36ce799c4145
terraform import railway_service.web      2e0ecb92-1b72-4f37-8efb-98549051ed7c
terraform import railway_service.app      387e5f18-c2b7-43a1-8677-46eb469ad212
```

Then run `terraform plan` and expect drift — reconcile by either
updating Railway to match the plan, or updating the `.tf` to match
Railway, until plan is clean.

## Destroying

```sh
terraform destroy
```

This wipes the project, all services, all data (Postgres is a plain
image with no volume). Don't run against production without confirming
the project name in the plan output.

## What Terraform doesn't cover

- **Secrets values.** Passwords, Polar tokens, webhook secrets are
  inputs. Manage them in your own secret store (1Password, doppler,
  flyctl secrets, etc.); don't commit `terraform.tfvars`.
- **Code deploys.** When `github_repo` is unset, `railway up` is still
  the path — wire it into CI (`.github/workflows/ci.yml` already does).
- **Railway-side settings not exposed by the provider** — autoscaling
  config, healthcheck paths, resource limits. Manage those in Railway's
  dashboard; note them in the service's `railway.json` if configurable.

## Files

| file                       | purpose                                                |
| -------------------------- | ------------------------------------------------------ |
| `providers.tf`             | provider pinning + auth                                |
| `variables.tf`             | inputs (workspace, secrets, github repo)               |
| `secrets.tf`               | generated Phoenix secret_key_base + playground secrets |
| `main.tf`                  | project, services, variables, domains                  |
| `outputs.tf`               | URLs + next steps                                      |
| `terraform.tfvars.example` | fill-in template                                       |
