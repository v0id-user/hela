defmodule Control.Repo.Migrations.ControlCore do
  use Ecto.Migration

  def change do
    execute("CREATE EXTENSION IF NOT EXISTS citext", "")

    create table(:accounts, primary_key: false) do
      add :id, :string, primary_key: true, null: false
      add :email, :citext, null: false
      add :password_hash, :string
      add :github_id, :string
      add :polar_customer_id, :string
      add :inserted_at, :utc_datetime, null: false
      add :updated_at, :utc_datetime, null: false
    end

    create unique_index(:accounts, [:email])
    create unique_index(:accounts, [:github_id], where: "github_id IS NOT NULL")

    create table(:projects, primary_key: false) do
      add :id, :string, primary_key: true, null: false
      add :account_id, :string, null: false
      add :name, :string, null: false
      add :region, :string, null: false
      add :tier, :string, null: false, default: "free"
      add :multi_region, {:array, :string}, null: false, default: []
      add :polar_subscription_id, :string
      add :jwt_public_key_jwk, :map
      add :inserted_at, :utc_datetime, null: false
      add :updated_at, :utc_datetime, null: false
    end

    create index(:projects, [:account_id])
    create index(:projects, [:region])

    create table(:api_keys, primary_key: false) do
      add :id, :string, primary_key: true, null: false
      add :project_id, :string, null: false
      add :prefix, :string, null: false
      add :hashed_secret, :string, null: false
      add :label, :string
      add :last_used_at, :utc_datetime
      add :revoked_at, :utc_datetime
      add :inserted_at, :utc_datetime, null: false
    end

    create unique_index(:api_keys, [:prefix])
    create index(:api_keys, [:project_id])

    create table(:audit_log, primary_key: false) do
      add :id, :string, primary_key: true, null: false
      add :account_id, :string
      add :project_id, :string
      add :action, :string, null: false
      add :metadata, :map, null: false, default: %{}
      add :ip, :string
      add :user_agent, :text
      add :inserted_at, :utc_datetime, null: false
    end
  end
end
