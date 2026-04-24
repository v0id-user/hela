ExUnit.start()

# Sandbox mode — each test owns its DB connection and rolls back on
# teardown, so tests can run in parallel without stepping on each other.
Ecto.Adapters.SQL.Sandbox.mode(Hela.Repo, :manual)
