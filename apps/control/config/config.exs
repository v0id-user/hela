import Config

config :control,
  ecto_repos: [Control.Repo],
  generators: [timestamp_type: :utc_datetime]

# See gateway/config/config.exs: distinct migration table so both apps
# can share one Postgres database.
config :control, Control.Repo, migration_source: "control_schema_migrations"

config :control, ControlWeb.Endpoint,
  url: [host: "localhost"],
  adapter: Bandit.PhoenixAdapter,
  render_errors: [formats: [json: ControlWeb.ErrorJSON], layout: false]

# Regional gateway endpoints. Control needs to know where each region's
# gateway cluster listens so it can push /_internal/projects upserts.
# Matches the same region slugs the SDK uses.
config :control, :gateways, %{
  "iad" => "http://localhost:4001",
  "sjc" => "http://localhost:4001",
  "fra" => "http://localhost:4001",
  "sin" => "http://localhost:4001",
  "syd" => "http://localhost:4001"
}

config :control, :internal_secret, "dev-only-internal-secret"

# Polar config lives entirely in env — see `Control.Polar` for the
# variables it reads. Dev works unconfigured (billing no-ops).

config :phoenix, :json_library, Jason

import_config "#{config_env()}.exs"
