import Config

if System.get_env("PHX_SERVER") do
  config :control, ControlWeb.Endpoint, server: true
end

if config_env() == :prod do
  database_url =
    System.get_env("DATABASE_URL") ||
      raise "DATABASE_URL is missing"

  config :control, Control.Repo,
    url: database_url,
    pool_size: String.to_integer(System.get_env("POOL_SIZE") || "10")

  secret_key_base =
    System.get_env("SECRET_KEY_BASE") ||
      raise "SECRET_KEY_BASE is missing"

  host = System.get_env("PHX_HOST") || "app-production-1716a.up.railway.app"
  port = String.to_integer(System.get_env("PORT") || "4000")

  config :control, ControlWeb.Endpoint,
    url: [host: host, port: 443, scheme: "https"],
    http: [ip: {0, 0, 0, 0, 0, 0, 0, 0}, port: port],
    secret_key_base: secret_key_base

  config :control,
         :internal_secret,
         System.get_env("GATEWAY_INTERNAL_SECRET") ||
           raise("GATEWAY_INTERNAL_SECRET is missing")

  # Per-region gateway endpoints come from env as a JSON map, e.g.:
  #   GATEWAYS={"iad":"https://iad-gateway.internal","ams":"https://..."}
  gateways =
    case System.get_env("GATEWAYS") do
      nil -> raise "GATEWAYS env (JSON map region -> url) is missing"
      j -> Jason.decode!(j)
    end

  config :control, :gateways, gateways

  # Polar env vars are all optional at boot — billing features lazy-check
  # `Control.Polar.configured?/0` and no-op gracefully without them.
  # Set in Polar dashboard or via `railway variables`:
  #   POLAR_ACCESS_TOKEN       — organization access token
  #   POLAR_ORG_ID             — your Polar organization UUID
  #   POLAR_ENV                — "sandbox" (default) | "production"
  #   POLAR_WEBHOOK_SECRET     — signing secret for /webhooks/polar
  #   POLAR_PRODUCT_STARTER    — product id for Starter tier
  #   POLAR_PRODUCT_GROWTH     — product id for Growth tier
  #   POLAR_PRODUCT_SCALE      — product id for Scale tier
end
