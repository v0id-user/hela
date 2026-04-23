defmodule HelaWeb.Plugs.InternalAuth do
  @moduledoc """
  Shared-secret check for `/_internal/*` endpoints. The secret is a
  gateway-specific value set by ops. Control reads the secret from its
  own `GATEWAYS_*` config and sends it on every internal request.
  """

  import Plug.Conn

  def init(opts), do: opts

  def call(conn, _opts) do
    expected = System.get_env("GATEWAY_INTERNAL_SECRET") || "dev-only-internal-secret"

    case get_req_header(conn, "x-hela-internal") do
      [^expected] ->
        conn

      _ ->
        conn
        |> put_resp_content_type("application/json")
        |> send_resp(401, Jason.encode!(%{error: "forbidden"}))
        |> halt()
    end
  end
end
