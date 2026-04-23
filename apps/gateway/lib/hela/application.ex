defmodule Hela.Application do
  @moduledoc false
  use Application

  @impl true
  def start(_type, _args) do
    Hela.Latency.init()

    children = [
      HelaWeb.Telemetry,
      Hela.Repo,
      {DNSCluster, query: Application.get_env(:hela, :dns_cluster_query) || :ignore},
      {Phoenix.PubSub, name: Hela.PubSub},
      Hela.Presence,
      Hela.Projects,
      Hela.Chat.Cache,
      Hela.Quota,
      Hela.Metrics,
      Hela.Chat.Pipeline,
      HelaWeb.Endpoint
    ]

    opts = [strategy: :one_for_one, name: Hela.Supervisor]
    Supervisor.start_link(children, opts)
  end

  @impl true
  def config_change(changed, _new, removed) do
    HelaWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end
