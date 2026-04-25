##
## Generated secrets exported as outputs for the operator to pipe into
## `railway variable set`. Terraform owns *generation* (so values are
## reproducible across plan/apply on the same machine), but does not
## own *distribution* — the operator copies output values into Railway
## environments via CLI. See `infra/railway/README.md` for the seeding
## commands.
##
## `keepers = {}` means Terraform never regenerates unless you
## explicitly `terraform taint random_password.<name>`.
##

resource "random_password" "gateway_secret_key_base" {
  length  = 96
  special = false
  keepers = {}
}

resource "random_password" "control_secret_key_base" {
  length  = 96
  special = false
  keepers = {}
}

resource "random_password" "playground_secret" {
  length  = 64
  special = false
  keepers = {}
}

resource "random_password" "internal_secret" {
  length  = 64
  special = false
  keepers = {}
}

resource "random_password" "postgres_password" {
  length  = 48
  special = false
  keepers = {}
}
