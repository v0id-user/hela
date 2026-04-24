terraform {
  required_version = ">= 1.7"

  required_providers {
    railway = {
      source = "terraform-community-providers/railway"
      # Pin 0.5.2+: earlier 0.5.x had an "inconsistent result after
      # apply" bug on the nested `volume` block on railway_service
      # (see upstream issue 61).
      version = "~> 0.5.2"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

# The provider reads RAILWAY_TOKEN from the environment. Generate a
# team-scoped token at https://railway.com/account/tokens and export it:
#
#     export RAILWAY_TOKEN=<token>
#     terraform plan
#
# A project-scoped token won't work here — the provider needs permission
# to create services and manage environments.
provider "railway" {}

provider "random" {}
