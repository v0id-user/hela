defmodule Hela.Release do
  @moduledoc """
  Called from `rel/overlays/bin/server` on release start:
  `bin/hela eval "Hela.Release.migrate"`. Boots only what the
  migration needs — no Endpoint, no channel processes.
  """
  @app :hela

  def migrate do
    load_app()

    for repo <- repos() do
      {:ok, _, _} = Ecto.Migrator.with_repo(repo, &Ecto.Migrator.run(&1, :up, all: true))
    end
  end

  def rollback(repo, version) do
    load_app()
    {:ok, _, _} = Ecto.Migrator.with_repo(repo, &Ecto.Migrator.run(&1, :down, to: version))
  end

  defp repos, do: Application.fetch_env!(@app, :ecto_repos)

  defp load_app do
    Application.load(@app)
  end
end
