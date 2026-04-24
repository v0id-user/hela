defmodule Hela.Latency do
  @moduledoc """
  Log-bucketed per-span histogram for hot-path measurements.

  Two spans tracked by default:
    * `:broadcast` — ingest → PubSub fan-out
    * `:persist`   — ingest → row in Postgres

  Each bucket is an atomic counter in an ETS `:set` so `observe/2` is lock-free
  and safe to call from the hot path. `snapshot/1` is called a few Hz by the
  metrics sampler; the two never coordinate.
  """

  @table :hela_latency
  # 64µs to ~8s, doubling each step. Fine enough to see p99 kicks, wide
  # enough to catch Postgres slowpath timeouts.
  @buckets [
    64,
    128,
    256,
    512,
    1_024,
    2_048,
    4_096,
    8_192,
    16_384,
    32_768,
    65_536,
    131_072,
    262_144,
    524_288,
    1_048_576,
    2_097_152,
    4_194_304,
    8_388_608
  ]

  @spans [:broadcast, :persist]

  def init do
    if :ets.info(@table) == :undefined do
      :ets.new(@table, [
        :set,
        :public,
        :named_table,
        write_concurrency: true,
        read_concurrency: true
      ])

      for span <- @spans do
        for edge <- @buckets do
          :ets.insert(@table, {{span, edge}, 0})
        end

        :ets.insert(@table, {{span, :count}, 0})
        :ets.insert(@table, {{span, :sum}, 0})
        :ets.insert(@table, {{span, :max}, 0})
      end
    end

    :ok
  end

  def observe(span, us) when span in @spans and is_integer(us) do
    edge = bucket_for(us)
    :ets.update_counter(@table, {span, edge}, {2, 1}, {{span, edge}, 0})
    :ets.update_counter(@table, {span, :count}, {2, 1}, {{span, :count}, 0})
    :ets.update_counter(@table, {span, :sum}, {2, us}, {{span, :sum}, 0})
    update_max(span, us)
    :ok
  end

  def observe(_, _), do: :ok

  def snapshot(span) when span in @spans do
    buckets =
      for edge <- @buckets do
        count =
          case :ets.lookup(@table, {span, edge}) do
            [{_, c}] -> c
            _ -> 0
          end

        %{le_us: edge, count: count}
      end

    count = counter(span, :count)
    max_us = counter(span, :max)

    %{
      buckets: buckets,
      count: count,
      max_us: max_us,
      p50_us: percentile(buckets, count, 0.50),
      p99_us: percentile(buckets, count, 0.99),
      p999_us: percentile(buckets, count, 0.999)
    }
  end

  def reset do
    for span <- @spans do
      for edge <- @buckets, do: :ets.insert(@table, {{span, edge}, 0})
      :ets.insert(@table, {{span, :count}, 0})
      :ets.insert(@table, {{span, :sum}, 0})
      :ets.insert(@table, {{span, :max}, 0})
    end

    :ok
  end

  defp counter(span, k) do
    case :ets.lookup(@table, {span, k}) do
      [{_, n}] -> n
      _ -> 0
    end
  end

  defp update_max(span, us) do
    case :ets.lookup(@table, {span, :max}) do
      [{_, cur}] when cur >= us -> :ok
      _ -> :ets.insert(@table, {{span, :max}, us})
    end
  end

  defp bucket_for(us) do
    Enum.find(@buckets, List.last(@buckets), &(us <= &1))
  end

  defp percentile(_buckets, 0, _p), do: 0

  defp percentile(buckets, count, p) do
    target = ceil(count * p)

    {_, hit} =
      Enum.reduce_while(buckets, {0, List.last(@buckets)}, fn %{le_us: edge, count: c},
                                                              {acc, _} ->
        next = acc + c

        if next >= target do
          {:halt, {next, edge}}
        else
          {:cont, {next, edge}}
        end
      end)

    hit
  end
end
