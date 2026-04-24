defmodule ControlWeb.Router do
  use ControlWeb, :router

  pipeline :api do
    plug :accepts, ["json"]
  end

  pipeline :api_session do
    plug :accepts, ["json"]
    plug :fetch_session
  end

  pipeline :session do
    plug ControlWeb.Plugs.RequireAccount
  end

  scope "/", ControlWeb do
    pipe_through :api

    get "/health", PageController, :health
    get "/version", PageController, :version

    post "/webhooks/polar", PolarWebhookController, :handle
  end

  scope "/", ControlWeb do
    pipe_through :api_session

    post "/auth/signup", AuthController, :signup
    post "/auth/login", AuthController, :login
    post "/auth/logout", AuthController, :logout
  end

  scope "/api", ControlWeb do
    pipe_through [:api_session, :session]

    get "/me", AuthController, :me
    get "/projects", ProjectsController, :index
    post "/projects", ProjectsController, :create
    get "/projects/:id", ProjectsController, :show
    patch "/projects/:id", ProjectsController, :update
    delete "/projects/:id", ProjectsController, :delete

    post "/projects/:id/keys", KeysController, :create
    get "/projects/:id/keys", KeysController, :index
    delete "/projects/:id/keys/:key_id", KeysController, :revoke

    put "/projects/:id/jwk", ProjectsController, :set_jwk
    post "/projects/:id/checkout", ProjectsController, :checkout
  end
end
