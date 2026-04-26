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

  # Per-region gateway endpoints. Today the hosted plane runs one
  # gateway in Amsterdam; per-region routing is a future expansion.
  # Two ways to wire this:
  #
  #   1. Set HELA_GATEWAY_URL to a single URL. Every region resolves
  #      to that URL. Right answer for the single-region deployment.
  #   2. Set GATEWAYS to a JSON map for per-region overrides, e.g.
  #      `GATEWAYS={"iad":"https://iad-gw...","ams":"https://ams-gw..."}`.
  #      Useful when more than one gateway exists.
  #
  # If both are set, GATEWAYS overrides per region; HELA_GATEWAY_URL is
  # the fallback for any region missing from GATEWAYS. Missing both
  # means the control plane has nowhere to push project upserts and
  # can't function — raise at boot.
  fallback_gateway = System.get_env("HELA_GATEWAY_URL")

  gateway_overrides =
    case System.get_env("GATEWAYS") do
      nil -> %{}
      j -> Jason.decode!(j)
    end

  if is_nil(fallback_gateway) and gateway_overrides == %{} do
    raise "set HELA_GATEWAY_URL (recommended) or GATEWAYS (per-region map). neither is set."
  end

  hosted_regions = ~w(iad sjc ams sin syd)

  gateways =
    Enum.reduce(hosted_regions, %{}, fn region, acc ->
      url = Map.get(gateway_overrides, region) || fallback_gateway

      if is_nil(url) do
        acc
      else
        Map.put(acc, region, url)
      end
    end)

  if gateways == %{} do
    raise "no gateway URL resolved for any hosted region. set HELA_GATEWAY_URL."
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
