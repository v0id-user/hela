##
## hela on Railway — declarative *structure*. Variable values are NOT
## managed here; see `infra/railway/README.md` for the per-service env
## var matrix and the `railway variable set` commands operators use to
## seed each environment.
##
## What Terraform owns:
##   - one Railway project, scoped to a workspace
##   - five services (postgres, gateway, control, web, app) and their
##     railway.json config_path mappings
##   - the postgres volume + mount path
##   - one public `.up.railway.app` domain per service
##   - GitHub source linkage so Railway auto-builds on push to `main`
##
## What Terraform deliberately doesn't own:
##   - environment variables (POLAR_*, DATABASE_URL, SECRET_KEY_BASE,
##     PHX_HOST, PORT, etc.) — set via `railway variable set` per env
##   - environment creation (production, dev) — created via `railway
##     environment new` and inherited from the project's default env
##
## This split keeps the production and dev environments free to diverge
## (different Polar orgs, different secrets) without contorting the
## Terraform graph into a per-env module. The trade-off: `railway` CLI
## is the source of truth for *values* and operators must remember to
## seed both envs. The README has copy-pasteable commands.
##

resource "railway_project" "hela" {
  name    = var.project_name
  team_id = var.workspace_id
  default_environment = {
    name = "production"
  }
  description    = "managed real-time on BEAM — auto-provisioned via terraform"
  has_pr_deploys = false
  private        = true
}

locals {
  env_id = railway_project.hela.default_environment.id
}

## ---- postgres ----------------------------------------------------------
##
## PostgreSQL 18. Alpine image. The persistent volume is mounted at
## /var/lib/postgresql, not /var/lib/postgresql/data, because the
## official Postgres 18 image stores PGDATA in a versioned subdirectory
## under that parent. See Docker's Postgres 18 persistence guidance and
## `docs/dev/environment.md` for rationale.
##
## Variables to set on this service (per env): POSTGRES_USER,
## POSTGRES_PASSWORD, POSTGRES_DB, PGDATA, POSTGRES_INITDB_ARGS. See
## `infra/railway/README.md` for the canonical commands.

resource "railway_service" "postgres" {
  name        = "postgres"
  project_id  = railway_project.hela.id
  source_repo = var.github_repo == "" ? null : var.github_repo
  config_path = "infra/railway/postgres/railway.json"

  volume = {
    name       = "pgdata"
    mount_path = "/var/lib/postgresql"
  }
}

## ---- gateway (realtime data plane) -------------------------------------

resource "railway_service" "gateway" {
  name        = "gateway"
  project_id  = railway_project.hela.id
  source_repo = var.github_repo == "" ? null : var.github_repo
  config_path = "apps/gateway/railway.json"
}

resource "railway_service_domain" "gateway" {
  environment_id = local.env_id
  service_id     = railway_service.gateway.id
  subdomain      = "${var.project_name}-gateway-${random_id.domain_suffix.hex}"
}

locals {
  gateway_domain = "${railway_service_domain.gateway.subdomain}.up.railway.app"
}

## ---- control (control plane) -------------------------------------------

resource "railway_service" "control" {
  name        = "control"
  project_id  = railway_project.hela.id
  source_repo = var.github_repo == "" ? null : var.github_repo
  config_path = "apps/control/railway.json"
}

resource "railway_service_domain" "control" {
  environment_id = local.env_id
  service_id     = railway_service.control.id
  subdomain      = "${var.project_name}-control-${random_id.domain_suffix.hex}"
}

locals {
  control_domain = "${railway_service_domain.control.subdomain}.up.railway.app"
}

## ---- web (marketing site) ----------------------------------------------

resource "railway_service" "web" {
  name        = "web"
  project_id  = railway_project.hela.id
  source_repo = var.github_repo == "" ? null : var.github_repo
  config_path = "apps/web/railway.json"
}

resource "railway_service_domain" "web" {
  environment_id = local.env_id
  service_id     = railway_service.web.id
  subdomain      = "${var.project_name}-web-${random_id.domain_suffix.hex}"
}

## ---- app (customer dashboard) ------------------------------------------

resource "railway_service" "app" {
  name        = "app"
  project_id  = railway_project.hela.id
  source_repo = var.github_repo == "" ? null : var.github_repo
  config_path = "apps/app/railway.json"
}

resource "railway_service_domain" "app" {
  environment_id = local.env_id
  service_id     = railway_service.app.id
  subdomain      = "${var.project_name}-app-${random_id.domain_suffix.hex}"
}

## ---- stable domain suffix ----------------------------------------------

# Railway requires unique subdomains across the platform. Prefixing with
# a stable random suffix avoids collisions when a team applies this
# module under multiple project names. `keepers = {}` means the suffix
# never rotates unless you explicitly taint it.
resource "random_id" "domain_suffix" {
  byte_length = 2
  keepers     = {}
}
