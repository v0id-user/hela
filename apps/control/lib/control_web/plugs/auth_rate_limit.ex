defmodule ControlWeb.Plugs.AuthRateLimit do
  @moduledoc """
  Per-IP limiter for unauthenticated auth routes.
  """

  import Plug.Conn
  require Logger

  def init(opts), do: Keyword.fetch!(opts, :action)

  def call(conn, action) do
    ip = caller_ip(conn)

    case Control.AuthLimiter.check(action, ip) do
      :ok ->
        conn

      {:error, :rate_limited, retry_ms} ->
        Logger.info("control auth rl deny: action=#{action} ip=#{ip} retry_ms=#{retry_ms}")

        conn
        |> put_resp_header("retry-after", to_string(div(retry_ms, 1000)))
        |> put_status(429)
        |> Phoenix.Controller.json(%{
          error: "rate_limited",
          scope: "auth",
          retry_after_ms: retry_ms
        })
        |> halt()
    end
  end

  defp caller_ip(conn) do
    case get_req_header(conn, "x-forwarded-for") do
      [value | _] ->
        value |> String.split(",") |> List.first() |> String.trim()

      _ ->
        case get_req_header(conn, "x-real-ip") do
          [value | _] -> String.trim(value)
          _ -> conn.remote_ip |> :inet.ntoa() |> to_string()
        end
    end
  end
end
