defmodule HelaWeb.ClusterController do
  use HelaWeb, :controller

  def snapshot(conn, _) do
    json(conn, Hela.Metrics.last_snapshot() || %{ready: false})
  end

  # Kept available behind a header check so ops can wipe runtime state
  # without redeploying. Doesn't touch Postgres.
  def reset(conn, _) do
    if System.get_env("HELA_ALLOW_RESET") == "1" do
      Hela.Channels.reset_runtime()
      json(conn, %{ok: true})
    else
      conn |> put_status(403) |> json(%{error: "disabled"})
    end
  end
end
