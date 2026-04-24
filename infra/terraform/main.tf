##
## Fly.io infra (secondary target — Railway is primary, see infra/railway/).
##
## Billing sits in Polar, not Stripe — managed outside of Terraform via the
## Polar dashboard + the control plane's built-in wiring. If you want
## products declared as IaC, reach for the Polar API; there's no
## Terraform provider for it at the time of writing.
##

terraform {
  required_version = ">= 1.7"

  required_providers {
    fly = {
      source  = "fly-apps/fly"
      version = "~> 0.0.23"
    }
  }
}

variable "fly_api_token" {
  type      = string
  sensitive = true
}

variable "gateway_regions" {
  type    = list(string)
  default = ["iad", "sjc", "fra", "sin", "syd"]
}

provider "fly" {
  fly_api_token = var.fly_api_token
}

# --- gateway: one Fly app + Postgres cluster per region ------------------

resource "fly_app" "gateway" {
  for_each = toset(var.gateway_regions)
  name     = "hela-gateway-${each.key}"
  org      = "hela"
}

# Fly Postgres as of 2026 is typically provisioned with `flyctl postgres
# create` rather than Terraform — the `fly` provider doesn't expose it.
# We keep a note here so whoever runs the module knows to run:
#
#   for r in iad sjc fra sin syd; do
#     flyctl postgres create --name hela-gw-db-$r --region $r --vm-size shared-cpu-1x
#     flyctl postgres attach hela-gw-db-$r --app hela-gateway-$r
#   done

# --- control: one global Fly app + one Fly Postgres in iad ---------------

resource "fly_app" "control" {
  name = "hela-control"
  org  = "hela"
}

# --- static apps ---------------------------------------------------------

resource "fly_app" "web" {
  name = "hela-web"
  org  = "hela"
}

resource "fly_app" "app" {
  name = "hela-app"
  org  = "hela"
}

output "fly_apps" {
  value = {
    gateway = { for r in var.gateway_regions : r => fly_app.gateway[r].name }
    control = fly_app.control.name
    web     = fly_app.web.name
    app     = fly_app.app.name
  }
}
