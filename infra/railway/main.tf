##
## hela on Railway — declarative infrastructure.
##
## One Railway project, five services. Postgres is shared by gateway +
## control (distinct `migration_source` tables per app in mix config).
## Gateway + control are Elixir releases; web + app are static bundles
## served by nginx.
##
## The four app services link to the GitHub repo when `github_repo` is
## set — Railway auto-builds + deploys on every push to `main`. CI's
## `railway up` path still works for hot-patching outside of GitOps.
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

  # Internal DNS for the postgres service. Railway assigns
  # `<service>.railway.internal` once the service is up.
  db_url = "ecto://hela:${var.postgres_password}@${railway_service.postgres.name}.railway.internal:5432/hela"

  # GitHub source fields. Set to null on each service when var.github_repo
  # is empty so the service is created without a source (manual
  # `railway up` deploys still work).
  gh_source = var.github_repo == "" ? null : {
    repo = var.github_repo
  }
}

## ---- postgres ----------------------------------------------------------

resource "railway_service" "postgres" {
  name         = "postgres"
  project_id   = railway_project.hela.id
  source_image = "postgres:16-alpine"
}

resource "railway_variable" "postgres_env" {
  for_each = {
    POSTGRES_USER     = "hela"
    POSTGRES_PASSWORD = var.postgres_password
    POSTGRES_DB       = "hela"
  }

  environment_id = local.env_id
  service_id     = railway_service.postgres.id
  name           = each.key
  value          = each.value
}

## ---- gateway (realtime data plane) -------------------------------------

resource "railway_service" "gateway" {
  name        = "gateway"
  project_id  = railway_project.hela.id
  source_repo = var.github_repo == "" ? null : var.github_repo
  # Service-level root dir is controlled via RAILWAY_DOCKERFILE_PATH env
  # var + config_path below.
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

resource "railway_variable" "gateway_env" {
  for_each = {
    PHX_SERVER              = "true"
    HELA_REGION             = var.gateway_region_slug
    DATABASE_URL            = local.db_url
    PHX_HOST                = local.gateway_domain
    PORT                    = "4000"
    POOL_SIZE               = "10"
    ECTO_IPV6               = "1"
    SECRET_KEY_BASE         = random_password.gateway_secret_key_base.result
    PLAYGROUND_SECRET       = random_password.playground_secret.result
    GATEWAY_INTERNAL_SECRET = random_password.internal_secret.result
    RAILWAY_DOCKERFILE_PATH = "apps/gateway/Dockerfile"
  }

  environment_id = local.env_id
  service_id     = railway_service.gateway.id
  name           = each.key
  value          = each.value
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

  gateways_json = jsonencode({
    iad = "https://${local.gateway_domain}"
    sjc = "https://${local.gateway_domain}"
    fra = "https://${local.gateway_domain}"
    sin = "https://${local.gateway_domain}"
    syd = "https://${local.gateway_domain}"
  })
}

resource "railway_variable" "control_env" {
  for_each = {
    PHX_SERVER              = "true"
    DATABASE_URL            = local.db_url
    PHX_HOST                = local.control_domain
    PORT                    = "4000"
    POOL_SIZE               = "10"
    ECTO_IPV6               = "1"
    SECRET_KEY_BASE         = random_password.control_secret_key_base.result
    GATEWAY_INTERNAL_SECRET = random_password.internal_secret.result
    GATEWAYS                = local.gateways_json
    POLAR_ENV               = var.polar_env
    POLAR_ACCESS_TOKEN      = var.polar_access_token
    POLAR_ORG_ID            = var.polar_org_id
    POLAR_WEBHOOK_SECRET    = var.polar_webhook_secret
    POLAR_PRODUCT_STARTER   = var.polar_product_starter
    POLAR_PRODUCT_GROWTH    = var.polar_product_growth
    POLAR_PRODUCT_SCALE     = var.polar_product_scale
    RAILWAY_DOCKERFILE_PATH = "apps/control/Dockerfile"
  }

  environment_id = local.env_id
  service_id     = railway_service.control.id
  name           = each.key
  value          = each.value
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

resource "railway_variable" "web_env" {
  for_each = {
    PORT                    = "80"
    VITE_HELA_API           = "https://${local.gateway_domain}"
    RAILWAY_DOCKERFILE_PATH = "apps/web/Dockerfile"
  }

  environment_id = local.env_id
  service_id     = railway_service.web.id
  name           = each.key
  value          = each.value
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

resource "railway_variable" "app_env" {
  for_each = {
    PORT                    = "80"
    VITE_HELA_CONTROL       = "https://${local.control_domain}"
    VITE_HELA_GATEWAY       = "https://${local.gateway_domain}"
    RAILWAY_DOCKERFILE_PATH = "apps/app/Dockerfile"
  }

  environment_id = local.env_id
  service_id     = railway_service.app.id
  name           = each.key
  value          = each.value
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
