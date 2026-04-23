defmodule HelaWeb.MetricsChannel do
  @moduledoc """
  Read-only firehose of `Hela.Metrics` snapshots to the public
  cluster dashboard. No auth — this is the same data published at
  /cluster/snapshot.
  """

  use Phoenix.Channel

  @impl true
  def join("metrics:live", _params, socket) do
    Phoenix.PubSub.subscribe(Hela.PubSub, "metrics:live")
    send(self(), :after_join)
    {:ok, socket}
  end

  @impl true
  def handle_info(:after_join, socket) do
    case Hela.Metrics.last_snapshot() do
      nil -> :ok
      snap -> push(socket, "snapshot", snap)
    end

    {:noreply, socket}
  end

  def handle_info({:snapshot, snap}, socket) do
    push(socket, "tick", snap)
    {:noreply, socket}
  end
end
