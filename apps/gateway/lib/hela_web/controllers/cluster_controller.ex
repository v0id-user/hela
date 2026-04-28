defmodule HelaWeb.ClusterController do
  use HelaWeb, :controller

  def snapshot(conn, _) do
    json(conn, Hela.Metrics.last_snapshot() || %{ready: false})
  end

  # Internal-auth only reset so ops can wipe runtime state without
  # redeploying. Doesn't touch Postgres.
  def reset(conn, _) do
    Hela.Channels.reset_runtime()
    json(conn, %{ok: true})
  end
end
