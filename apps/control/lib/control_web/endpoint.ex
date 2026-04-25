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

  plug Plug.RequestId
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

  defp cache_body(conn, _) do
    if conn.request_path == "/webhooks/polar" do
      {:ok, body, conn} = Plug.Conn.read_body(conn)
      Plug.Conn.assign(conn, :raw_body, body)
    else
      conn
    end
  end
end
