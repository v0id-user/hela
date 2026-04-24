defmodule Hela.DataCase do
  @moduledoc """
  Base case for tests that touch Ecto. Checks out a DB sandbox
  connection and cleans up on exit.
  """

  use ExUnit.CaseTemplate

  using do
    quote do
      alias Hela.Repo
      import Ecto
      import Ecto.Changeset
      import Ecto.Query
    end
  end

  setup tags do
    :ok = Ecto.Adapters.SQL.Sandbox.checkout(Hela.Repo)

    unless tags[:async] do
      Ecto.Adapters.SQL.Sandbox.mode(Hela.Repo, {:shared, self()})
    end

    :ok
  end
end
