defmodule ControlWeb.Endpoint do
  use Phoenix.Endpoint, otp_app: :control

  @session_options [
    store: :cookie,
    key: "_control_key",
    signing_salt: "xK9mR+/",
    same_site: "Lax"
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
  plug CORSPlug, origin: ["*"]
  plug ControlWeb.Router

  defp cache_body(conn, _) do
    if conn.request_path == "/webhooks/polar" do
      {:ok, body, conn} = Plug.Conn.read_body(conn)
      Plug.Conn.assign(conn, :raw_body, body)
    else
      conn
    end
  end
end
