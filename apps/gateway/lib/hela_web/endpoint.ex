defmodule HelaWeb.Endpoint do
  use Phoenix.Endpoint, otp_app: :hela

  @session_options [
    store: :cookie,
    key: "_hela_key",
    signing_salt: "j8NVDK+/",
    same_site: "Lax"
  ]

  socket "/live", Phoenix.LiveView.Socket,
    websocket: [connect_info: [session: @session_options]],
    longpoll: [connect_info: [session: @session_options]]

  # Main WS — what the SDK talks. Accepts either an API key (server side)
  # or a JWT (browser side) via `token` connect param.
  socket "/socket", HelaWeb.UserSocket,
    websocket: [timeout: 45_000, connect_info: [:peer_data, :x_headers]],
    longpoll: false

  plug Plug.Static, at: "/", from: :hela, gzip: not code_reloading?, only: HelaWeb.static_paths()

  if code_reloading? do
    socket "/phoenix/live_reload/socket", Phoenix.LiveReloader.Socket
    plug Phoenix.LiveReloader
    plug Phoenix.CodeReloader
    plug Phoenix.Ecto.CheckRepoStatus, otp_app: :hela
  end

  plug Phoenix.LiveDashboard.RequestLogger,
    param_key: "request_logger",
    cookie_key: "request_logger"

  plug Plug.RequestId, assign_as: :request_id
  plug :put_observability_headers
  plug Plug.Telemetry, event_prefix: [:phoenix, :endpoint]

  plug Plug.Parsers,
    parsers: [:urlencoded, :multipart, :json],
    pass: ["*/*"],
    json_decoder: Phoenix.json_library()

  plug Plug.MethodOverride
  plug Plug.Head
  plug Plug.Session, @session_options
  plug CORSPlug, origin: ["*"]
  plug HelaWeb.Router

  defp put_observability_headers(conn, _) do
    Plug.Conn.register_before_send(conn, fn conn ->
      conn
      |> Plug.Conn.put_resp_header("x-hela-service", "gateway")
      |> Plug.Conn.put_resp_header("x-hela-region", Hela.region())
      |> Plug.Conn.put_resp_header("x-hela-version", app_version())
      |> maybe_put_commit_header()
    end)
  end

  defp app_version, do: Application.spec(:hela, :vsn) |> to_string()

  defp maybe_put_commit_header(conn) do
    case env_first(["RAILWAY_GIT_COMMIT_SHA", "SOURCE_VERSION", "GITHUB_SHA"]) do
      nil -> conn
      commit -> Plug.Conn.put_resp_header(conn, "x-hela-commit", commit)
    end
  end

  defp env_first(names) do
    Enum.find_value(names, fn name ->
      case System.get_env(name) do
        nil -> nil
        "" -> nil
        value -> value
      end
    end)
  end
end
