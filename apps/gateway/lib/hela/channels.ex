defmodule Hela.Channels do
  @moduledoc """
  Public API for publish / subscribe / history on a (project, channel) pair.

  Hot path for `publish/1`:

    1. UUIDv7 minted at ingest.
    2. Quota check on the project's monthly message count.
    3. Inserted into the node-local ETS ring buffer (O(1)).
    4. `Phoenix.PubSub` distributed broadcast on the channel topic.
    5. Cluster-wide cache-sync broadcast so every replica mirrors the row.
    6. Broadway pipeline for batched Postgres insert.
    7. Latency + telemetry counters bumped.

  Nothing on the hot path blocks on the cold tier (Postgres).
  """

  alias Hela.Chat.{Cache, Message, Pipeline}
  alias Hela.{Quota, Repo}
  alias Phoenix.PubSub

  import Ecto.Query
  require Logger

  @pubsub Hela.PubSub

  def topic(project_id, channel), do: "chan:#{project_id}:#{channel}"

  @doc """
  Publish a message to (project_id, channel). Returns `{:ok, wire, :ok}` or
  `{:ok, wire, :over_quota}` if the project is over its monthly cap — the
  message is still delivered and persisted; the over_quota flag is a signal
  to the caller for overage billing.

  Rejects with `{:error, :body_too_large}` for bodies over 4KB.
  """
  def publish(%{project_id: _, channel: _, author: _, body: body} = attrs)
      when is_binary(body) do
    cond do
      byte_size(body) > 4_000 ->
        {:error, :body_too_large}

      true ->
        tier = Hela.Projects.tier(attrs.project_id)

        # Per-second rate limit. Reject with retry_after_ms so clients
        # can back off. Done BEFORE id minting / cache / pubsub — no
        # side-effects spent on a rejected message.
        case Quota.check_rate(attrs.project_id, tier) do
          {:error, :rate_limited, retry_ms} ->
            :telemetry.execute([:hela, :ingest, :rate_limited], %{count: 1}, %{
              project_id: attrs.project_id,
              channel: attrs.channel
            })

            {:error, {:rate_limited, retry_ms}}

          :ok ->
            do_publish(attrs, tier)
        end
    end
  end

  defp do_publish(attrs, tier) do
    t0 = System.monotonic_time(:microsecond)
    msg = Message.new(attrs)
    ephemeral? = attrs[:ephemeral] == true
    quota = Quota.bump_messages(msg.project_id, tier)

    :telemetry.execute(
      [:hela, :ingest, :received],
      %{count: 1},
      %{project_id: msg.project_id, channel: msg.channel}
    )

    unless ephemeral? do
      Cache.put(msg)
    end

    wire = Message.to_wire(msg)
    PubSub.broadcast!(@pubsub, topic(msg.project_id, msg.channel), {:message, wire})
    PubSub.broadcast!(@pubsub, "firehose", {:message, wire})

    unless ephemeral? do
      PubSub.broadcast!(@pubsub, "cache:sync", {:cache_sync, msg})
    end

    Hela.Latency.observe(:broadcast, System.monotonic_time(:microsecond) - t0)

    unless ephemeral? do
      Pipeline.push(msg, t0)
    end

    if quota.over?, do: {:ok, wire, :over_quota}, else: {:ok, wire, :ok}
  end

  @doc """
  Paginated history. Cache-first, DB fall-through for misses and top-up
  for partial hits. Returns `{source, messages}` where source is one of
  `:cache`, `:mixed`, `:db` — useful for the landing-page demo which
  shows where the data came from.
  """
  def history(project_id, channel, before_id \\ nil, limit \\ 50) do
    case Cache.fetch(project_id, channel, before_id, limit) do
      {:ok, msgs} when length(msgs) >= limit ->
        {:cache, Enum.map(msgs, &Message.to_wire/1)}

      {:ok, msgs} ->
        extra_before =
          case msgs do
            [oldest | _] -> oldest.id
            [] -> before_id
          end

        needed = limit - length(msgs)
        db = history_db(project_id, channel, extra_before, needed)
        {:mixed, Enum.map(db ++ msgs, &Message.to_wire/1)}

      :miss ->
        {:db, history_db(project_id, channel, before_id, limit) |> Enum.map(&Message.to_wire/1)}
    end
  end

  def ephemeral_history do
    {:cache, []}
  end

  defp history_db(project_id, channel, before_id, limit) do
    pivot =
      case before_id do
        nil -> nil
        <<_::binary-size(16)>> = b -> Hela.ID.bin_to_string(b)
        <<_::binary-size(36)>> = s -> s
      end

    base =
      from m in Message,
        where: m.project_id == ^project_id and m.channel == ^channel,
        order_by: [desc: m.id],
        limit: ^limit

    query = if pivot, do: from(m in base, where: m.id < ^pivot), else: base
    Repo.all(query) |> Enum.reverse()
  end

  @doc "Clear every cache + counter in the cluster. DB is left intact."
  def reset_runtime do
    PubSub.broadcast!(@pubsub, "hela:reset", :reset_local)
    :ok
  end
end
