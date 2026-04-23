# hela/infra/terraform

Provisions Fly apps (not machines) and Stripe products + prices for hela.

Per-region Fly Postgres clusters still need `flyctl postgres create` —
the Fly provider doesn't expose a Postgres resource. See the inline
comment in `main.tf` for the one-liner.

## Usage

```
export TF_VAR_fly_api_token=$(flyctl auth token)
export TF_VAR_stripe_api_key=sk_test_...

terraform init
terraform plan
terraform apply
```

## Adding a new region

Append the slug to `gateway_regions` in `main.tf`, `terraform apply`, then:

```
flyctl postgres create --name hela-gw-db-NEW --region NEW --vm-size shared-cpu-1x
flyctl postgres attach hela-gw-db-NEW --app hela-gateway-NEW

flyctl secrets set --app hela-gateway-NEW \
  SECRET_KEY_BASE=$(mix phx.gen.secret) \
  GATEWAY_INTERNAL_SECRET=$(openssl rand -hex 32)

flyctl deploy --config ../fly/gateway-NEW.fly.toml \
              --app hela-gateway-NEW \
              --dockerfile ../../apps/gateway/Dockerfile ../..

# Finally, update control's GATEWAYS map and redeploy:
flyctl secrets set --app hela-control GATEWAYS='{"iad":"...","NEW":"..."}'
flyctl deploy --config ../fly/control.fly.toml --app hela-control
```
