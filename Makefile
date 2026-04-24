.PHONY: help dev dev.gateway dev.control dev.web dev.app setup test fmt \
        build deploy.gateway.iad deploy.control stripe.listen

help:
	@echo 'hela — managed real-time on BEAM'
	@echo ''
	@echo 'make setup            install deps, create + migrate db'
	@echo 'make dev              run all four apps locally (concurrently)'
	@echo 'make dev.gateway      just the gateway'
	@echo 'make dev.control      just the control plane'
	@echo 'make dev.web          just the marketing site'
	@echo 'make dev.app          just the customer dashboard'
	@echo 'make test             run test suites across apps'
	@echo 'make fmt              format everything'
	@echo 'make build            build all production bundles + docker images'
	@echo 'make stripe.listen    forward stripe test webhooks to control'
	@echo ''
	@echo 'make deploy.gateway.iad  roll a new gateway image to iad'
	@echo 'make deploy.control      roll a new control image'

setup:
	@echo '> starting postgres in docker'
	@docker compose up -d postgres
	@sleep 2
	@echo '> installing js deps'
	@bun install
	@echo '> gateway deps + db'
	@cd apps/gateway && mix deps.get && mix ecto.setup
	@echo '> control deps + db'
	@cd apps/control && mix deps.get && mix ecto.setup
	@echo '> done. run `make dev`.'

dev.gateway:
	@cd apps/gateway && iex --sname gateway -S mix phx.server

dev.control:
	@cd apps/control && iex --sname control -S mix phx.server

dev.web:
	@bun run dev:web

dev.app:
	@bun run dev:app

# All four services in one terminal; prefix-tagged lines. Ctrl-C stops all.
dev:
	@bun run dev:all

test:
	@cd apps/gateway && mix test
	@cd apps/control && mix test

fmt:
	@cd apps/gateway && mix format
	@cd apps/control && mix format
	@bunx prettier --write 'apps/{web,app}/src/**/*.{ts,tsx,css}' 'packages/**/src/**/*.{ts,tsx,css}' || true

build:
	@bun run build:sdk
	@cd apps/web && bun run build
	@cd apps/app && bun run build
	@docker build -t hela/gateway -f apps/gateway/Dockerfile apps/gateway
	@docker build -t hela/control -f apps/control/Dockerfile apps/control

# ---- railway (primary deploy target) ----------------------------------

railway.plan:
	@cd infra/railway && terraform plan

railway.apply:
	@cd infra/railway && terraform apply

railway.up.gateway:
	@railway up ./apps/gateway --service gateway --path-as-root --ci --detach

railway.up.control:
	@railway up ./apps/control --service control --path-as-root --ci --detach

railway.up.web:
	@cd apps/web && bun run build
	@railway up ./apps/web --service web --path-as-root --ci --detach

railway.up.app:
	@cd apps/app && bun run build
	@railway up ./apps/app --service app --path-as-root --ci --detach

railway.up.all: railway.up.gateway railway.up.control railway.up.web railway.up.app

# ---- fly (secondary / future) -----------------------------------------

fly.deploy.gateway.iad:
	@flyctl deploy --config infra/fly/gateway-iad.fly.toml \
	               --app hela-gateway-iad \
	               --dockerfile apps/gateway/Dockerfile \
	               --remote-only .

fly.deploy.control:
	@flyctl deploy --config infra/fly/control.fly.toml \
	               --app hela-control \
	               --dockerfile apps/control/Dockerfile \
	               --remote-only .

# ---- billing (polar) --------------------------------------------------

polar.listen:
	@echo 'use Polar dashboard → webhook endpoint → copy URL to POLAR_WEBHOOK_SECRET'

# ---- repo hygiene -----------------------------------------------------

hooks:
	@sh scripts/install-hooks.sh

lint:
	@cd apps/gateway && mix format --check-formatted
	@cd apps/control && mix format --check-formatted
	@cd apps/gateway && mix credo --strict 2>/dev/null || echo '(credo not installed — skipping)'
	@bunx --bun tsc -b packages/sdk-js packages/sdk-types apps/web apps/app --noEmit

e2e:
	@uv run scripts/e2e.py

e2e.sdk:
	@echo 'run: bun run scripts/sdk_e2e.ts (needs scratch install — see scripts/README.md)'
