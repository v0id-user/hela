defmodule Hela.Repo.Migrations.GatewayCache do
  use Ecto.Migration

  def change do
    # Gateway-local mirror of project configuration, maintained by the
    # control plane via /_internal/projects upserts. Lives alongside
    # `messages` in the gateway's regional Postgres.
    create table(:projects_cache, primary_key: false) do
      add :id, :string, primary_key: true
      add :account_id, :string
      add :tier, :string, null: false, default: "free"
      add :region, :string, null: false
      add :jwt_public_key_jwk, :map
      add :updated_at, :utc_datetime, null: false
    end

    create index(:projects_cache, [:region])

    # API-key auth. Gateway mirrors the hashed secret + prefix so we can
    # authenticate REST traffic without a control-plane round-trip.
    create table(:api_keys_cache, primary_key: false) do
      add :id, :string, primary_key: true
      add :project_id, :string, null: false
      add :prefix, :string, null: false
      add :hashed_secret, :string, null: false
      add :revoked_at, :utc_datetime
    end

    create unique_index(:api_keys_cache, [:prefix])
    create index(:api_keys_cache, [:project_id])
  end
end
