variable "project_name" {
  description = "Railway project name. Must be unique within your Railway workspace."
  type        = string
  default     = "hela"
}

variable "workspace_id" {
  description = "Railway team/workspace UUID. `railway workspace` to list."
  type        = string
}

variable "github_repo" {
  description = <<-EOT
    GitHub repo slug (owner/name) to deploy from. If set, the four app
    services get linked to this repo and Railway auto-builds on push. If
    empty, services are created without a source — you `railway up` them
    manually or from CI.
  EOT
  type        = string
  default     = "v0id-user/hela"
}

variable "github_branch" {
  description = "Branch to track for auto-deploys."
  type        = string
  default     = "main"
}

# --- gateway region assignment ------------------------------------------
#
# At v1 there's one gateway service handling all regions. Introducing more
# gateways means adding entries here and a module per region. The per-
# region env var `HELA_REGION` is what the code uses to identify itself.

variable "gateway_region_slug" {
  description = "Region slug this gateway reports as (iad, sjc, fra, sin, syd)."
  type        = string
  default     = "iad"

  validation {
    condition     = contains(["iad", "sjc", "fra", "sin", "syd"], var.gateway_region_slug)
    error_message = "gateway_region_slug must be one of iad, sjc, fra, sin, syd."
  }
}

# --- secrets ------------------------------------------------------------
#
# These are sensitive. Provide via -var-file=secrets.tfvars (gitignored)
# or set TF_VAR_* env vars before `terraform apply`. The three random
# secrets (playground, internal, signing bases) get generated if left
# null.

variable "postgres_password" {
  description = "Postgres superuser password. Also used as the app DB password."
  type        = string
  sensitive   = true
}

variable "polar_access_token" {
  description = "Polar organization access token (polar_oat_...)."
  type        = string
  sensitive   = true
}

variable "polar_org_id" {
  description = "Polar organization UUID."
  type        = string
}

variable "polar_env" {
  description = "Polar environment — sandbox or production."
  type        = string
  default     = "sandbox"
}

variable "polar_webhook_secret" {
  description = "Signing secret from Polar's webhook-endpoint config (whsec_ or polar_whs_ prefix)."
  type        = string
  sensitive   = true
}

variable "polar_product_starter" {
  description = "Polar product id for the Starter tier."
  type        = string
}

variable "polar_product_growth" {
  description = "Polar product id for the Growth tier."
  type        = string
}

variable "polar_product_scale" {
  description = "Polar product id for the Scale tier."
  type        = string
}
