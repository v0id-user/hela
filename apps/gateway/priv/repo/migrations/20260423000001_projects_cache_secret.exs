defmodule Hela.Repo.Migrations.ProjectsCacheSecret do
  use Ecto.Migration

  @moduledoc """
  Mirror column for the per-project HS256 signing secret. Control pushes
  this via /_internal/projects on every project upsert; gateway reads it
  on JWT verify.
  """

  def change do
    alter table(:projects_cache) do
      add :jwt_signing_secret, :string
    end
  end
end
