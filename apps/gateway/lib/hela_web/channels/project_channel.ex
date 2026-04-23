defmodule HelaWeb.ProjectChannel do
  @moduledoc """
  The channel the SDK joins for pub/sub, presence, and history.

  Topic shape is `chan:<project_id>:<channel_name>`. The project_id in the
  topic MUST match the project the token authorised — the socket assigns
  are the source of truth, not the topic the client picks. Channel names
  may themselves contain colons; we split only on the first two.
  """

  use Phoenix.Channel

  alias Hela.{Channels, Presence}
  alias Hela.Auth.JWT

  intercept ["presence_diff"]

  @impl true
  def join("chan:" <> rest, params, socket) do
    case split_topic(rest) do
      {project_id, channel_name} ->
        cond do
          project_id != socket.assigns.project_id ->
            {:error, %{reason: "project_mismatch"}}

          not JWT.authorized?(socket.assigns.claims, :read, channel_name) ->
            {:error, %{reason: "unauthorized_read"}}

          true ->
            send(self(), :after_join)
            {source, msgs} = Channels.history(project_id, channel_name, nil, 50)
            nickname = params["nickname"] || socket.assigns.sub

            {:ok, %{messages: msgs, source: source, node: to_string(node()), region: Hela.region()},
             socket
             |> assign(:channel, channel_name)
             |> assign(:nickname, nickname)}
        end

      :error ->
        {:error, %{reason: "bad_topic"}}
    end
  end

  @impl true
  def handle_in("publish", %{"body" => body} = params, socket) do
    cond do
      not JWT.authorized?(socket.assigns.claims, :write, socket.assigns.channel) ->
        {:reply, {:error, %{reason: "unauthorized_write"}}, socket}

      true ->
        author = params["author"] || socket.assigns.nickname

        case Channels.publish(%{
               project_id: socket.assigns.project_id,
               channel: socket.assigns.channel,
               author: author,
               body: body,
               reply_to_id: params["reply_to_id"]
             }) do
          {:ok, wire, :ok} ->
            {:reply, {:ok, %{id: wire.id, quota: "ok"}}, socket}

          {:ok, wire, :over_quota} ->
            {:reply, {:ok, %{id: wire.id, quota: "over"}}, socket}

          {:error, {:rate_limited, retry_ms}} ->
            {:reply,
             {:error, %{reason: "rate_limited", retry_after_ms: retry_ms}},
             socket}

          {:error, reason} ->
            {:reply, {:error, %{reason: reason}}, socket}
        end
    end
  end

  def handle_in("history", params, socket) do
    before = params["before"]
    limit = min(params["limit"] || 50, 100)

    {source, msgs} =
      Channels.history(socket.assigns.project_id, socket.assigns.channel, before, limit)

    {:reply, {:ok, %{messages: msgs, source: source}}, socket}
  end

  def handle_in("set_nick", %{"nickname" => nick}, socket) when is_binary(nick) do
    topic = Channels.topic(socket.assigns.project_id, socket.assigns.channel)
    old = socket.assigns.nickname
    Presence.untrack(self(), topic, old)

    {:ok, _} =
      Presence.track(self(), topic, nick, %{
        online_at: System.system_time(:second),
        node: to_string(node()),
        region: Hela.region()
      })

    {:reply, :ok, assign(socket, :nickname, nick)}
  end

  def handle_in("ping", params, socket) do
    {:reply, {:ok, %{ok: true, t: params["t"], region: Hela.region(), node: to_string(node())}},
     socket}
  end

  @impl true
  def handle_info(:after_join, socket) do
    topic = Channels.topic(socket.assigns.project_id, socket.assigns.channel)

    :telemetry.execute([:hela, :channel, :joined], %{count: 1}, %{
      project_id: socket.assigns.project_id,
      channel: socket.assigns.channel
    })

    {:ok, _} =
      Presence.track(self(), topic, socket.assigns.nickname, %{
        online_at: System.system_time(:second),
        node: to_string(node()),
        region: Hela.region()
      })

    push(socket, "presence_state", Presence.list(topic))

    # Subscribe to the channel's broadcast topic. Phoenix.Channel.Server
    # already does this for the channel's OWN topic, but we use a custom
    # topic name that doesn't match the join key, so we subscribe explicitly.
    Phoenix.PubSub.subscribe(Hela.PubSub, topic)
    {:noreply, socket}
  end

  def handle_info({:message, wire}, socket) do
    push(socket, "message", wire)
    {:noreply, socket}
  end

  @impl true
  def handle_out("presence_diff", payload, socket) do
    push(socket, "presence_diff", payload)
    {:noreply, socket}
  end

  @impl true
  def terminate(_reason, socket) do
    Hela.Quota.decr_connection(socket.assigns.project_id)

    if socket.assigns[:channel] do
      :telemetry.execute([:hela, :channel, :left], %{count: 1}, %{
        project_id: socket.assigns.project_id,
        channel: socket.assigns.channel
      })
    end

    :ok
  end

  defp split_topic(rest) do
    case String.split(rest, ":", parts: 2) do
      [pid, channel] -> {pid, channel}
      _ -> :error
    end
  end
end
