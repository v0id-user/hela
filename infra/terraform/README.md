# hela/infra/terraform

> **Standby only.** Railway is the current primary deploy target —
> see [`infra/railway/`](../railway/) for the live Terraform. This
> Fly module stays around so we can pivot back to Fly when /
> if multi-region BEAM clustering over IPv6 becomes worth the move.
> Don't run `terraform apply` here without a conversation first.

Provisions Fly apps (not machines) and Polar products + prices for
hela on Fly.

Per-region Fly Postgres clusters still need `flyctl postgres create` —
the Fly provider doesn't expose a Postgres resource. See the inline
comment in `main.tf` for the one-liner.

## Usage (if you actually want to bring up Fly)

```sh
export TF_VAR_fly_api_token=$(flyctl auth token)
export TF_VAR_polar_access_token=polar_oat_...

terraform init
terraform plan
terraform apply
```

## Adding a new region (Fly path)

Append the slug to `gateway_regions` in `main.tf`, `terraform
apply`, then:

```sh
flyctl postgres create --name hela-gw-db-NEW --region NEW --vm-size shared-cpu-1x
flyctl postgres attach hela-gw-db-NEW --app hela-gateway-NEW

flyctl secrets set --app hela-gateway-NEW \
  SECRET_KEY_BASE=$(mix phx.gen.secret) \
  HELA_REGION=NEW \
  GATEWAY_INTERNAL_SECRET=$(openssl rand -hex 32)

flyctl deploy --config ../fly/gateway-NEW.fly.toml \
              --app hela-gateway-NEW \
              --dockerfile ../../apps/gateway/Dockerfile ../..

# Finally, update control's GATEWAYS map and redeploy:
flyctl secrets set --app hela-control GATEWAYS='{"ams":"...","NEW":"..."}'
flyctl deploy --config ../fly/control.fly.toml --app hela-control
```

For the live Railway path, the one-variable equivalent is
`gateway_region_slug` in
[`../railway/variables.tf`](../railway/variables.tf) — add a new
service instance per region when we're ready to actually ship
multi-region.
