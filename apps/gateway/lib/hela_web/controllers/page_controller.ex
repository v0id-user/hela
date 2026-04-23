defmodule HelaWeb.PageController do
  use HelaWeb, :controller

  def index(conn, _) do
    json(conn, %{
      service: "hela",
      region: Hela.region(),
      node: to_string(node()),
      time: DateTime.utc_now() |> DateTime.to_iso8601()
    })
  end

  def health(conn, _), do: json(conn, %{ok: true})
end
