import Config

config :control, Control.Repo,
  username: "postgres",
  password: "postgres",
  hostname: "localhost",
  database: "control_test#{System.get_env("MIX_TEST_PARTITION")}",
  pool: Ecto.Adapters.SQL.Sandbox,
  pool_size: System.schedulers_online() * 2

config :control, ControlWeb.Endpoint,
  http: [ip: {127, 0, 0, 1}, port: 4003],
  secret_key_base: "test-control-secret-0123456789abcdef0123456789abcdef0123456789abcdef",
  server: false

config :logger, level: :warning
