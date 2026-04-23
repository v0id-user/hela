defmodule Hela.Metrics do
  @moduledoc """
  Per-node metrics sampler. Subscribes to ingest/persist telemetry, polls
  BEAM runtime every 100ms, and broadcasts a snapshot on the
  `metrics:live` PubSub topic at ~3.3Hz.

  The landing-page `/dashboard` route consumes this via a metrics WS channel.
  """

  use GenServer

  @topic "metrics:live"
  @tick_ms 300

  def start_link(_), do: GenServer.start_link(__MODULE__, [], name: __MODULE__)

  def last_snapshot, do: GenServer.call(__MODULE__, :last)

  @impl true
  def init(_) do
    :telemetry.attach_many(
      "hela-metrics",
      [
        [:hela, :ingest, :received],
        [:hela, :batch, :persisted],
        [:hela, :channel, :joined],
        [:hela, :channel, :left]
      ],
      &__MODULE__.handle_event/4,
      nil
    )

    :timer.send_interval(@tick_ms, :tick)
    Phoenix.PubSub.subscribe(Hela.PubSub, "hela:reset")

    {:ok,
     %{
       counters: %{ingest_received: 0, batch_persisted: 0, channels: 0},
       prev_counters: %{ingest_received: 0, batch_persisted: 0, channels: 0},
       ingest_by_channel: %{},
       last: nil,
       t0: System.monotonic_time(:millisecond)
     }}
  end

  def handle_event([:hela, :ingest, :received], %{count: c}, meta, _) do
    key = "#{meta[:project_id]}/#{meta[:channel]}"
    GenServer.cast(__MODULE__, {:bump, :ingest_received, c, key})
  end

  def handle_event([:hela, :batch, :persisted], %{count: c}, _, _) do
    GenServer.cast(__MODULE__, {:bump, :batch_persisted, c, nil})
  end

  def handle_event([:hela, :channel, :joined], %{count: c}, _, _) do
    GenServer.cast(__MODULE__, {:bump, :channels, c, nil})
  end

  def handle_event([:hela, :channel, :left], %{count: c}, _, _) do
    GenServer.cast(__MODULE__, {:bump, :channels, -c, nil})
  end

  @impl true
  def handle_cast({:bump, k, c, nil}, state) do
    {:noreply, update_in(state.counters[k], &((&1 || 0) + c))}
  end

  def handle_cast({:bump, :ingest_received, c, key}, state) do
    state =
      state
      |> update_in([:counters, :ingest_received], &((&1 || 0) + c))
      |> update_in([:ingest_by_channel, key], &((&1 || 0) + c))

    {:noreply, state}
  end

  @impl true
  def handle_info(:tick, state) do
    now = System.monotonic_time(:millisecond)
    dt_s = max((now - state.t0) / 1000, 0.001)

    snapshot = build_snapshot(state, dt_s)

    Phoenix.PubSub.broadcast!(Hela.PubSub, @topic, {:snapshot, snapshot})

    {:noreply,
     %{
       state
       | prev_counters: state.counters,
         last: snapshot,
         t0: now
     }}
  end

  def handle_info(:reset_local, state) do
    Hela.Latency.reset()

    {:noreply,
     %{
       state
       | counters: %{ingest_received: 0, batch_persisted: 0, channels: 0},
         prev_counters: %{ingest_received: 0, batch_persisted: 0, channels: 0},
         ingest_by_channel: %{},
         t0: System.monotonic_time(:millisecond)
     }}
  end

  @impl true
  def handle_call(:last, _, state), do: {:reply, state.last, state}

  defp build_snapshot(state, dt_s) do
    c = state.counters
    p = state.prev_counters

    rate = fn key ->
      delta = (c[key] || 0) - (p[key] || 0)
      if delta < 0, do: 0.0, else: delta / dt_s
    end

    mem = :erlang.memory()

    scheds_online =
      try do
        :erlang.system_info(:schedulers_online)
      rescue
        _ -> 1
      end

    %{
      at_ms: System.system_time(:millisecond),
      node: to_string(node()),
      region: Hela.region(),
      cluster: Enum.map([node() | Node.list()], &to_string/1),
      connections: Hela.Chat.Cache.total_count() |> elem_or(:connections),
      rates: %{
        ingest_received: rate.(:ingest_received),
        batch_persisted: rate.(:batch_persisted),
        reductions: 0.0
      },
      counters: %{
        ingest_received_total: c[:ingest_received] || 0,
        batch_persisted_total: c[:batch_persisted] || 0,
        channels_open: c[:channels] || 0
      },
      pipeline: %{queue_depth: Hela.Chat.Pipeline.queue_depth()},
      cache: %{
        total: Hela.Chat.Cache.total_count(),
        by_project: Hela.Chat.Cache.counts_by_project()
      },
      quota: Hela.Quota.counts_by_project(),
      ingest_by_channel: state.ingest_by_channel,
      latency: %{
        broadcast: Hela.Latency.snapshot(:broadcast),
        persist: Hela.Latency.snapshot(:persist)
      },
      system: %{
        processes: :erlang.system_info(:process_count),
        processes_limit: :erlang.system_info(:process_limit),
        atoms: :erlang.system_info(:atom_count),
        atoms_limit: :erlang.system_info(:atom_limit),
        ports: :erlang.system_info(:port_count),
        ports_limit: :erlang.system_info(:port_limit),
        ets_tables: :erlang.system_info(:ets_count),
        memory_mb: mem[:total] / 1_048_576,
        memory_processes_mb: mem[:processes] / 1_048_576,
        memory_binary_mb: mem[:binary] / 1_048_576,
        memory_ets_mb: mem[:ets] / 1_048_576,
        memory_code_mb: mem[:code] / 1_048_576,
        run_queue: :erlang.statistics(:run_queue),
        schedulers: scheds_online,
        uptime_s: div(:erlang.statistics(:wall_clock) |> elem(0), 1000)
      }
    }
  end

  defp elem_or(v, _), do: v
end
