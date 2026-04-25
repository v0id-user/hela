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

# Per-service environment variables (POLAR_*, DATABASE_URL, SECRET_KEY_BASE,
# PHX_HOST, etc.) are *not* declared here — they are managed via the
# `railway` CLI per environment. See `infra/railway/README.md` for the
# full matrix and seeding commands.
