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

# Per-region gateway rollouts. Add one target per region as the fleet grows.
deploy.gateway.iad:
	@flyctl deploy --config infra/fly/gateway-iad.fly.toml \
	               --app hela-gateway-iad \
	               --dockerfile apps/gateway/Dockerfile \
	               --remote-only .

deploy.control:
	@flyctl deploy --config infra/fly/control.fly.toml \
	               --app hela-control \
	               --dockerfile apps/control/Dockerfile \
	               --remote-only .

stripe.listen:
	@stripe listen --forward-to http://localhost:4000/webhooks/stripe
