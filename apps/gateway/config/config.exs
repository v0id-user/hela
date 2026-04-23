import Config

config :hela,
  ecto_repos: [Hela.Repo],
  generators: [timestamp_type: :utc_datetime]

# Gateway can safely share a Postgres DB with the control plane — table
# names don't collide. We just need a distinct migration table so
# `mix ecto.migrate` in one app doesn't trample the other's history.
config :hela, Hela.Repo, migration_source: "gateway_schema_migrations"

config :hela, HelaWeb.Endpoint,
  url: [host: "localhost"],
  adapter: Bandit.PhoenixAdapter,
  render_errors: [
    formats: [json: HelaWeb.ErrorJSON],
    layout: false
  ],
  pubsub_server: Hela.PubSub

# Every region registers under a name like :iad. Default for local dev.
config :hela, :region, System.get_env("HELA_REGION", "dev")

# Playground: signed guest tokens for the landing-page demos. 5-minute TTL,
# scoped to the `public` project only. Server-private; no customer keys.
config :hela, :playground,
  project_id: "proj_public",
  secret: "dev-only-playground-secret-change-me-in-prod",
  ttl_seconds: 300

config :phoenix, :json_library, Jason

import_config "#{config_env()}.exs"
