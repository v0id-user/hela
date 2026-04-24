defmodule Hela.Quota do
  @moduledoc """
  Per-project quota counters.

  Live values (connections, 30-day rolling messages) live in ETS for
  sub-microsecond reads on the hot path. A periodic snapshot flushes to
  the `usage_daily` Postgres table so invoices and customer charts have
  a persisted trail.

  The counters here are per-node. The customer dashboard aggregates across
  nodes via the same metrics PubSub channel the regional cluster dashboard
  uses.

  For v1 this is a single-node cheap implementation; a production rollout
  would replace this with a shared counter (Redis or Postgres advisory-lock)
  so caps are enforced across the whole regional cluster rather than per
  node. The tradeoff is documented in `/how`.
  """

  use GenServer

  @connections :hela_quota_conns
  @messages :hela_quota_msgs
  # Per-project rate limit bucket: key `{project_id, unix_second}`, value
  # publishes-this-second. Entries are disposable — old buckets get GC'd
  # on the next tick that lands on a new second.
  @rate :hela_quota_rate
  @tiers %{
    # msgs: monthly cap  ·  conns: hard live-connection cap  ·  rate: publishes/sec
    "free" => %{msgs: 1_000_000, conns: 100, rate: 5},
    "starter" => %{msgs: 10_000_000, conns: 1_000, rate: 15},
    "growth" => %{msgs: 100_000_000, conns: 10_000, rate: 100},
    "scale" => %{msgs: 1_000_000_000, conns: 100_000, rate: 1_000},
    "ent" => %{msgs: :infinity, conns: :infinity, rate: :infinity}
  }

  def start_link(_), do: GenServer.start_link(__MODULE__, [], name: __MODULE__)

  def tier(name), do: Map.get(@tiers, name, @tiers["free"])

  @doc "Check if project's current connection count is under its tier's cap."
  def admit_connection?(project_id, tier_name) do
    cap = tier(tier_name).conns

    case cap do
      :infinity ->
        true

      _ ->
        current =
          case :ets.lookup(@connections, project_id) do
            [{_, n}] -> n
            _ -> 0
          end

        current < cap
    end
  end

  def incr_connection(project_id) do
    :ets.update_counter(@connections, project_id, {2, 1}, {project_id, 0})
  end

  def decr_connection(project_id) do
    :ets.update_counter(@connections, project_id, {2, -1}, {project_id, 0})
  end

  def connection_count(project_id) do
    case :ets.lookup(@connections, project_id) do
      [{_, n}] -> max(n, 0)
      _ -> 0
    end
  end

  @doc """
  Record a published message against the project's monthly bucket.
  Returns a map with `:count` (post-increment) and `:over?` (was the bump
  over the tier cap, i.e. eligible for overage billing).
  """
  def bump_messages(project_id, tier_name \\ "free") do
    n = :ets.update_counter(@messages, project_id, {2, 1}, {project_id, 0})
    cap = tier(tier_name).msgs
    %{count: n, over?: cap != :infinity and n > cap}
  end

  @doc """
  Check and consume one token from the project's per-second rate bucket.

  Returns `:ok` if the bucket has room under the tier's `rate` cap, or
  `{:error, :rate_limited, retry_after_ms}` otherwise. The caller drops
  the publish and responds to the client.

  Bucket is the current unix second; publishes land at cell granularity
  so a burst of 40 in 0.5s on Starter (cap 15/s) gets 15 through this
  second and 15 through the next second, the remaining 10 rejected.
  """
  def check_rate(project_id, tier_name) do
    case tier(tier_name).rate do
      :infinity ->
        :ok

      cap ->
        second = System.system_time(:second)
        key = {project_id, second}
        n = :ets.update_counter(@rate, key, {2, 1}, {key, 0})

        if n <= cap do
          :ok
        else
          {:error, :rate_limited, 1000 - rem(System.system_time(:millisecond), 1000)}
        end
    end
  end

  def message_count(project_id) do
    case :ets.lookup(@messages, project_id) do
      [{_, n}] -> n
      _ -> 0
    end
  end

  def counts_by_project do
    msgs = :ets.foldl(fn {k, n}, acc -> Map.put(acc, k, n) end, %{}, @messages)
    conns = :ets.foldl(fn {k, n}, acc -> Map.put(acc, k, n) end, %{}, @connections)

    keys = MapSet.union(MapSet.new(Map.keys(msgs)), MapSet.new(Map.keys(conns)))

    keys
    |> Enum.map(fn k ->
      {k, %{messages: Map.get(msgs, k, 0), connections: Map.get(conns, k, 0)}}
    end)
    |> Map.new()
  end

  def reset do
    :ets.delete_all_objects(@connections)
    :ets.delete_all_objects(@messages)
    :ets.delete_all_objects(@rate)
    :ok
  end

  @impl true
  def init(_) do
    :ets.new(@connections, [:set, :public, :named_table, write_concurrency: true])
    :ets.new(@messages, [:set, :public, :named_table, write_concurrency: true])
    :ets.new(@rate, [:set, :public, :named_table, write_concurrency: true])
    Phoenix.PubSub.subscribe(Hela.PubSub, "hela:reset")
    # GC rate buckets older than 10s every 10s so ETS doesn't grow
    # unbounded under high traffic.
    :timer.send_interval(10_000, :gc_rate)
    {:ok, %{}}
  end

  @impl true
  def handle_info(:reset_local, state) do
    reset()
    {:noreply, state}
  end

  def handle_info(:gc_rate, state) do
    cutoff = System.system_time(:second) - 10
    # ETS select_delete with a match spec: delete keys where second < cutoff
    :ets.select_delete(@rate, [
      {{{:_, :"$1"}, :_}, [{:<, :"$1", cutoff}], [true]}
    ])

    {:noreply, state}
  end
end
