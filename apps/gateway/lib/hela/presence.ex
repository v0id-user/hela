defmodule Hela.Presence do
  @moduledoc """
  Phoenix.Presence tracker, scoped by (project_id, channel).

  Each channel topic at the Presence layer is the full internal topic
  `chan:proj_xxx:<channel_name>`. Join/leave on any node is CRDT-replicated
  across every other node in the region's cluster.

  Cross-project presence is impossible by construction — the topic itself
  is project-scoped.
  """

  use Phoenix.Presence,
    otp_app: :hela,
    pubsub_server: Hela.PubSub
end
