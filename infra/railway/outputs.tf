output "project_id" {
  description = "Railway project UUID."
  value       = railway_project.hela.id
}

output "urls" {
  description = "Public URLs for every deployed service."
  value = {
    web     = "https://${local.web_domain}"
    app     = "https://${local.app_domain}"
    gateway = "https://${local.gateway_domain}"
    control = "https://${local.control_domain}"
  }
}

output "gateway_internal" {
  description = "Internal Railway DNS for the gateway (used by control for /_internal/* calls)."
  value       = "${railway_service.gateway.name}.railway.internal"
}

output "postgres_internal" {
  description = "Internal Railway DNS for postgres."
  value       = "${railway_service.postgres.name}.railway.internal"
}

output "next_steps" {
  description = "What to do after `terraform apply`."
  value = <<-EOT

    Terraform has provisioned the project. Still to do:

    1. Add ${local.control_domain}/webhooks/polar to your Polar
       sandbox as a webhook endpoint. Copy the signing secret it
       generates and re-run:

         TF_VAR_polar_webhook_secret=<new-secret> terraform apply

    2. If you didn't set github_repo, deploy the code manually:

         make railway.up.all

    3. Verify with:

         HELA_GATEWAY=https://${local.gateway_domain} \
         HELA_CONTROL=https://${local.control_domain} \
           uv run scripts/e2e.py

  EOT
}

locals {
  web_domain = "${railway_service_domain.web.subdomain}.up.railway.app"
  app_domain = "${railway_service_domain.app.subdomain}.up.railway.app"
}
