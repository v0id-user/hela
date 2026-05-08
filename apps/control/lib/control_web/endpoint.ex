defmodule ControlWeb.Endpoint do
  use Phoenix.Endpoint, otp_app: :control

  # In :prod we issue cross-site cookies (SameSite=None + Secure) so the
  # `app` subdomain can talk to `control` cross-origin with credentials.
  # In :dev we keep SameSite=Lax + non-Secure so localhost without HTTPS
  # works; same-origin requests are arranged via the Vite dev proxy in
  # `apps/app/vite.config.ts`.
  @session_options [
    store: :cookie,
    key: "_control_key",
    signing_salt: "xK9mR+/",
    same_site: if(Mix.env() == :prod, do: "None", else: "Lax"),
    secure: Mix.env() == :prod
  ]

  plug Plug.Static,
    at: "/",
    from: :control,
    gzip: not code_reloading?,
    only: ControlWeb.static_paths()

  plug Plug.RequestId, assign_as: :request_id
  plug :put_observability_headers
  plug Plug.Telemetry, event_prefix: [:phoenix, :endpoint]

  # Polar webhook needs the RAW body to verify its HMAC signature.
  # Cache it on conn.assigns before Plug.Parsers decodes the JSON.
  plug :cache_body

  plug Plug.Parsers,
    parsers: [:urlencoded, :multipart, :json],
    pass: ["*/*"],
    json_decoder: Phoenix.json_library()

  plug Plug.MethodOverride
  plug Plug.Head
  plug Plug.Session, @session_options
  plug CORSPlug, origin: &__MODULE__.allowed_origins/0, credentials: true
  plug ControlWeb.Router

  @doc """
  Allowed CORS origins for credentialed requests. Read at runtime from
  `ALLOWED_ORIGINS` (comma-separated), with localhost defaults so `bun
  run dev` in `apps/app` and `apps/web` works without extra setup.
  """
  def allowed_origins do
    case System.get_env("ALLOWED_ORIGINS") do
      nil -> ["http://localhost:5173", "http://localhost:5174"]
      "" -> ["http://localhost:5173", "http://localhost:5174"]
      csv -> csv |> String.split(",") |> Enum.map(&String.trim/1)
    end
  end

  defp put_observability_headers(conn, _) do
    Plug.Conn.register_before_send(conn, fn conn ->
      conn
      |> Plug.Conn.put_resp_header("x-hela-service", "control")
      |> Plug.Conn.put_resp_header("x-hela-version", app_version())
      |> maybe_put_commit_header()
    end)
  end

  defp cache_body(conn, _) do
    if conn.request_path == "/webhooks/polar" do
      {:ok, body, conn} = Plug.Conn.read_body(conn)
      Plug.Conn.assign(conn, :raw_body, body)
    else
      conn
    end
  end

  defp app_version, do: Application.spec(:control, :vsn) |> to_string()

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
