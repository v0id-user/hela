defmodule Control.Application do
  @moduledoc false
  use Application

  @impl true
  def start(_type, _args) do
    children = [
      ControlWeb.Telemetry,
      Control.Repo,
      {Phoenix.PubSub, name: Control.PubSub},
      Control.AuthLimiter,
      ControlWeb.Endpoint
    ]

    opts = [strategy: :one_for_one, name: Control.Supervisor]
    Supervisor.start_link(children, opts)
  end

  @impl true
  def config_change(changed, _new, removed) do
    ControlWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end
