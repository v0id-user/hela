import Config

if System.get_env("PHX_SERVER") do
  config :hela, HelaWeb.Endpoint, server: true
end

if config_env() == :prod do
  database_url =
    System.get_env("DATABASE_URL") ||
      raise """
      environment variable DATABASE_URL is missing.
      For example: ecto://USER:PASS@HOST/DATABASE
      """

  maybe_ipv6 = if System.get_env("ECTO_IPV6") in ~w(true 1), do: [:inet6], else: []

  config :hela, Hela.Repo,
    url: database_url,
    pool_size: String.to_integer(System.get_env("POOL_SIZE") || "10"),
    socket_options: maybe_ipv6

  secret_key_base =
    System.get_env("SECRET_KEY_BASE") ||
      raise "environment variable SECRET_KEY_BASE is missing."

  host = System.get_env("PHX_HOST") || "gateway-production-bfdf.up.railway.app"
  port = String.to_integer(System.get_env("PORT") || "4000")

  browser_origins =
    [
      host,
      System.get_env("HELA_WEB_HOST") || "web-production-f24fc.up.railway.app",
      System.get_env("HELA_APP_HOST") || "app-production-1716a.up.railway.app"
    ]
    |> Enum.map(&"//#{&1}")
    |> Enum.uniq()

  config :hela, :dns_cluster_query, System.get_env("DNS_CLUSTER_QUERY")

  # The region slug this gateway reports as. Must match the physical
  # deployment. Unset → crash at boot rather than silently lie about
  # being in Ashburn (how we ended up with an Amsterdam gateway
  # reporting `iad` for the first few weeks of v1).
  config :hela,
         :region,
         System.get_env("HELA_REGION") ||
           raise("""
           HELA_REGION env var required. Set to the slug matching this
           gateway's physical region: one of iad, sjc, ams, sin, syd.
           """)

  config :hela, :playground,
    project_id: System.get_env("PLAYGROUND_PROJECT_ID", "proj_public"),
    secret:
      System.get_env("PLAYGROUND_SECRET") ||
        raise("PLAYGROUND_SECRET missing"),
    ttl_seconds: String.to_integer(System.get_env("PLAYGROUND_TTL_S") || "300")

  config :hela, HelaWeb.Endpoint,
    url: [host: host, port: 443, scheme: "https"],
    http: [ip: {0, 0, 0, 0, 0, 0, 0, 0}, port: port],
    # Browser SDK clients connect cross-origin from the hosted web/app origins.
    # Keep the allowlist explicit so Phoenix still rejects unexpected origins.
    check_origin: browser_origins,
    secret_key_base: secret_key_base
end
