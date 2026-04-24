import Config

config :hela, Hela.Repo,
  username: "postgres",
  password: "postgres",
  hostname: "localhost",
  database: "gateway_dev",
  stacktrace: true,
  show_sensitive_data_on_connection_error: true,
  pool_size: 10

config :hela, HelaWeb.Endpoint,
  http: [ip: {127, 0, 0, 1}, port: 4001],
  check_origin: false,
  code_reloader: true,
  debug_errors: true,
  secret_key_base:
    "dev-secret-key-base-replace-me-with-mix-phx-gen-secret-in-prod-0123456789abcdef",
  watchers: []

config :hela, dev_routes: true
config :logger, :default_formatter, format: "[$level] $message\n", metadata: [:request_id]
config :phoenix, :stacktrace_depth, 20
config :phoenix, :plug_init_mode, :runtime
