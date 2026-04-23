defmodule Hela.Repo.Migrations.CreateCore do
  use Ecto.Migration

  def change do
    # Only the data-plane tables live in the gateway's per-region DB.
    # accounts / projects (canonical) / api_keys (canonical) live in
    # control's DB. We sync the subset we need into `projects_cache` and
    # `api_keys_cache` in the next migration.

    create table(:messages, primary_key: false) do
      add :id, :uuid, primary_key: true, null: false
      add :project_id, :string, null: false
      add :channel, :string, null: false
      add :author, :string
      add :body, :text
      add :reply_to_id, :uuid
      add :node, :string
      add :inserted_at, :utc_datetime_usec, null: false
    end

    create index(:messages, [:project_id, :channel, :id],
             name: :messages_proj_chan_id_desc,
             using: :btree
           )

    create table(:usage_daily, primary_key: false) do
      add :project_id, :string, null: false
      add :date, :date, null: false
      add :messages, :bigint, null: false, default: 0
      add :peak_connections, :integer, null: false, default: 0
    end

    create unique_index(:usage_daily, [:project_id, :date])
  end
end
