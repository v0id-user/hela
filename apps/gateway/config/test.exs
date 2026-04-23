import Config

config :hela, Hela.Repo,
  username: "postgres",
  password: "postgres",
  hostname: "localhost",
  database: "hela_test#{System.get_env("MIX_TEST_PARTITION")}",
  pool: Ecto.Adapters.SQL.Sandbox,
  pool_size: System.schedulers_online() * 2

config :hela, HelaWeb.Endpoint,
  http: [ip: {127, 0, 0, 1}, port: 4002],
  secret_key_base: "test-secret-key-base-0123456789abcdef0123456789abcdef0123456789abcdef",
  server: false

config :logger, level: :warning
config :phoenix, :plug_init_mode, :runtime
