defmodule HelaWeb.Plugs.APIKeyAuth do
  @moduledoc """
  Resolve the `Authorization: Bearer hk_...` header to a `project_id`
  and stash it on `conn.assigns[:project_id]`. Controllers MUST read
  the project_id from assigns — never from URL params or the body,
  since the HTTP layer is the only place we enforce tenant boundaries
  for REST traffic.
  """
  import Plug.Conn

  def init(opts), do: opts

  def call(conn, _opts) do
    with ["Bearer " <> token] <- get_req_header(conn, "authorization"),
         {:ok, project_id} <- Hela.APIKeys.authenticate(token) do
      assign(conn, :project_id, project_id)
    else
      _ ->
        conn
        |> put_resp_content_type("application/json")
        |> send_resp(401, Jason.encode!(%{error: "unauthorized"}))
        |> halt()
    end
  end
end
