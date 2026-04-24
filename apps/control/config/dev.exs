import Config

config :control, Control.Repo,
  username: "postgres",
  password: "postgres",
  hostname: "localhost",
  database: "control_dev",
  pool_size: 10,
  stacktrace: true,
  show_sensitive_data_on_connection_error: true

config :control, ControlWeb.Endpoint,
  http: [ip: {127, 0, 0, 1}, port: 4000],
  check_origin: false,
  code_reloader: true,
  debug_errors: true,
  secret_key_base:
    "dev-control-secret-key-base-replace-me-0123456789abcdef0123456789abcdef0123456789",
  watchers: []

config :logger, :default_formatter, format: "[$level] $message\n", metadata: [:request_id]
config :phoenix, :plug_init_mode, :runtime
