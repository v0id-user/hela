defmodule HelaWeb.Router do
  use HelaWeb, :router

  pipeline :api do
    plug :accepts, ["json"]
  end

  pipeline :api_key do
    plug HelaWeb.Plugs.APIKeyAuth
  end

  pipeline :internal do
    plug HelaWeb.Plugs.InternalAuth
  end

  # Per-IP rate limits for the public playground. Token issuance has
  # its own bucket (tighter — one mint per second, 30 per hour) so a
  # noisy publisher can't starve other visitors from getting a token
  # in the first place.
  pipeline :playground_token_rl do
    plug HelaWeb.Plugs.PlaygroundRateLimit, action: :token
  end

  pipeline :playground_publish_rl do
    plug HelaWeb.Plugs.PlaygroundRateLimit, action: :publish
  end

  scope "/", HelaWeb do
    pipe_through :api

    get "/", PageController, :index
    get "/health", PageController, :health
    get "/version", PageController, :version
    get "/regions", RegionController, :index
    get "/regions/:slug/ping", RegionController, :ping

    # Aggregate cluster metrics — powers the public /dashboard page.
    get "/cluster/snapshot", ClusterController, :snapshot
  end

  # Landing-page playground — free, public, IP-rate-limited on top of
  # the shared proj_public project's per-second quota.
  scope "/playground", HelaWeb do
    pipe_through [:api, :playground_token_rl]

    post "/token", PlaygroundController, :token
  end

  scope "/playground", HelaWeb do
    pipe_through [:api, :playground_publish_rl]

    get "/history/:channel", PlaygroundController, :history
    post "/publish", PlaygroundController, :publish
  end

  # Customer-facing REST surface. Scoped to a single project by the
  # api_key plug — the controller never reads project_id from params.
  scope "/v1", HelaWeb do
    pipe_through [:api, :api_key]

    post "/tokens", TokensController, :create
    get "/channels/:channel/history", ChannelsController, :history
    post "/channels/:channel/publish", ChannelsController, :publish
  end

  # Control-plane → gateway sync. Shared-secret gated.
  scope "/_internal", HelaWeb do
    pipe_through [:api, :internal]

    post "/projects", InternalController, :upsert_project
    delete "/projects/:id", InternalController, :delete_project
    post "/api_keys", InternalController, :upsert_api_key
    post "/api_keys/:id/revoke", InternalController, :revoke_api_key
    post "/cluster/reset", ClusterController, :reset
  end

  if Application.compile_env(:hela, :dev_routes) do
    import Phoenix.LiveDashboard.Router

    scope "/dev" do
      pipe_through :api
      live_dashboard "/dashboard", metrics: HelaWeb.Telemetry
    end
  end
end
