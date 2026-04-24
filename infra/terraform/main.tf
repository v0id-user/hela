terraform {
  required_version = ">= 1.7"

  required_providers {
    fly = {
      source  = "fly-apps/fly"
      version = "~> 0.0.23"
    }

    stripe = {
      source  = "lukasaron/stripe"
      version = "~> 3.4"
    }
  }
}

variable "fly_api_token" {
  type      = string
  sensitive = true
}

variable "stripe_api_key" {
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

provider "stripe" {
  api_key = var.stripe_api_key
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

# --- Stripe products + prices (one per paid tier) ------------------------

locals {
  tiers = {
    starter = { price = 1900, nickname = "Starter" }
    growth  = { price = 9900, nickname = "Growth" }
    scale   = { price = 49900, nickname = "Scale" }
  }
}

resource "stripe_product" "tier" {
  for_each = local.tiers
  name     = "hela ${each.value.nickname}"
  type     = "service"
}

resource "stripe_price" "tier" {
  for_each    = local.tiers
  product     = stripe_product.tier[each.key].id
  currency    = "usd"
  unit_amount = each.value.price
  recurring {
    interval = "month"
  }
  lookup_key = "price_${each.key}"
}

output "fly_apps" {
  value = {
    gateway = { for r in var.gateway_regions : r => fly_app.gateway[r].name }
    control = fly_app.control.name
    web     = fly_app.web.name
    app     = fly_app.app.name
  }
}

output "stripe_price_ids" {
  value     = { for k, p in stripe_price.tier : k => p.id }
  sensitive = false
}
