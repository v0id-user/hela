defmodule HelaWeb.Plugs.PlaygroundRateLimit do
  @moduledoc """
  Plug that enforces `Hela.PlaygroundLimiter` per request to
  `/playground/*`. Expected to be attached to the router pipeline
  that those routes share, not to every endpoint.

  Accepts `:action` in init opts (`:token` or `:publish`) to select
  which bucket to bill against. Separate buckets let abuse of one
  surface not starve the other.

  The caller's IP is taken from the first `x-forwarded-for` header if
  present (so Railway / Fly / Cloudflare pass through the real
  client IP), else `conn.remote_ip` directly.
  """

  import Plug.Conn
  require Logger

  def init(opts), do: Keyword.fetch!(opts, :action)

  def call(conn, action) do
    ip = caller_ip(conn)

    case Hela.PlaygroundLimiter.check(action, ip) do
      :ok ->
        conn

      {:error, :rate_limited, retry_ms} ->
        Logger.info("playground rl deny: action=#{action} ip=#{ip} retry_ms=#{retry_ms}")

        conn
        |> put_resp_header("retry-after", to_string(div(retry_ms, 1000) + 1))
        |> put_status(429)
        |> Phoenix.Controller.json(%{
          error: "rate_limited",
          scope: "playground",
          retry_after_ms: retry_ms
        })
        |> halt()
    end
  end

  # --- helpers -----------------------------------------------------

  defp caller_ip(conn) do
    case get_req_header(conn, "x-forwarded-for") do
      [value | _] ->
        value
        |> String.split(",")
        |> List.first()
        |> String.trim()

      _ ->
        case get_req_header(conn, "x-real-ip") do
          [value | _] -> String.trim(value)
          _ -> conn.remote_ip |> :inet.ntoa() |> to_string()
        end
    end
  end
end
