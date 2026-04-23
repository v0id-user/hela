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

  scope "/", HelaWeb do
    pipe_through :api

    get "/", PageController, :index
    get "/health", PageController, :health
    get "/regions", RegionController, :index
    get "/regions/:slug/ping", RegionController, :ping

    # Landing-page playground only — free, heavily rate-limited, public.
    post "/playground/token", PlaygroundController, :token
    get "/playground/history/:channel", PlaygroundController, :history
    post "/playground/publish", PlaygroundController, :publish

    # Aggregate cluster metrics — powers the public /dashboard page.
    get "/cluster/snapshot", ClusterController, :snapshot
    post "/cluster/reset", ClusterController, :reset
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
  end

  if Application.compile_env(:hela, :dev_routes) do
    import Phoenix.LiveDashboard.Router

    scope "/dev" do
      pipe_through :api
      live_dashboard "/dashboard", metrics: HelaWeb.Telemetry
    end
  end
end
