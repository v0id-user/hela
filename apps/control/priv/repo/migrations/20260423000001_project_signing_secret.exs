defmodule Control.Repo.Migrations.ProjectSigningSecret do
  use Ecto.Migration

  @moduledoc """
  Per-project HS256 secret for server-issued JWT tokens (the `/v1/tokens`
  path). Replaces the earlier derived-from-pid secret which had no entropy.

  Stored as hex so it's transport-safe; gateway mirrors it in its own
  projects_cache via the existing /_internal/projects sync.

  Existing rows get a random value from `gen_random_bytes` so previously
  created projects keep working after migration.
  """

  def change do
    alter table(:projects) do
      add :jwt_signing_secret, :string
    end

    # Backfill existing rows. `encode(gen_random_bytes(32), 'hex')` needs
    # pgcrypto. If the extension isn't there the migration creates it.
    execute "CREATE EXTENSION IF NOT EXISTS pgcrypto", ""

    execute """
            UPDATE projects
               SET jwt_signing_secret = encode(gen_random_bytes(32), 'hex')
             WHERE jwt_signing_secret IS NULL
            """,
            ""
  end
end
