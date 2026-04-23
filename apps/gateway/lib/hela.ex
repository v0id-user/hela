defmodule Hela do
  @moduledoc """
  hela — managed real-time infrastructure on BEAM.

  Public API surface is intentionally small: five primitives.

    * `Hela.Channels` — publish/subscribe/history per (project, channel)
    * `Hela.Presence` — per-channel roster, CRDT-replicated across the region
    * `Hela.Auth` — JWT grant verification against customer-registered JWKs
    * `Hela.Accounts` — account/project/API-key CRUD
    * `Hela.Quota` — per-project connection and message caps

  Everything below these modules is internal: ETS cache, Broadway pipeline,
  Phoenix.PubSub wiring, telemetry.
  """

  @doc "The region this node is running in (e.g. \"iad\"). Set via HELA_REGION."
  def region, do: Application.fetch_env!(:hela, :region)
end
