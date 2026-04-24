##
## Randomly-generated Phoenix secrets. Regenerating these rotates the
## corresponding keys — `terraform apply` will push the new values and
## Railway will restart the affected service.
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
