defmodule Hela.Chat.Cache do
  @moduledoc """
  In-memory ring buffer per (project, channel), backed by one `ordered_set` ETS.

  Key layout: `{{project_id, channel}, id_bin}`. `ordered_set` keeps keys
  sorted, so cursor pagination is `:ets.prev/2` walk. Each (project, channel)
  bucket holds at most `@max_per_channel` messages; older rows are trimmed
  lazily on insert.
  """

  use GenServer

  @table :hela_cache
  @counts :hela_cache_counts
  @max_per_channel 200

  def start_link(_), do: GenServer.start_link(__MODULE__, [], name: __MODULE__)

  @doc """
  Insert a message. Hot-path, safe from any process.
  Idempotent: re-inserting the same id is a no-op (cache-sync broadcasts
  land on the originating node too).
  """
  def put(%Hela.Chat.Message{} = m) do
    key = bucket_key(m.project_id, m.channel)

    if :ets.insert_new(@table, {{key, m.id}, m}) do
      count = :ets.update_counter(@counts, key, {2, 1}, {key, 0})

      if count > @max_per_channel * 2 do
        GenServer.cast(__MODULE__, {:trim, key})
      end
    end

    :ok
  end

  @doc """
  Fetch up to `limit` messages older than `before_id`. `before_id: nil` = latest.
  Returns oldest→newest.
  """
  def fetch(project_id, channel, before_id, limit) when limit > 0 do
    key = bucket_key(project_id, channel)

    case :ets.member(@counts, key) do
      false ->
        :miss

      true ->
        pivot = normalize_pivot(before_id)
        matches = select_desc(key, pivot, limit)
        {:ok, Enum.reverse(matches)}
    end
  end

  def count(project_id, channel) do
    case :ets.lookup(@counts, bucket_key(project_id, channel)) do
      [{_, n}] -> n
      [] -> 0
    end
  end

  def total_count do
    :ets.foldl(fn {_, n}, acc -> acc + n end, 0, @counts)
  end

  def counts_by_project do
    :ets.foldl(
      fn {{proj, _ch}, n}, acc -> Map.update(acc, proj, n, &(&1 + n)) end,
      %{},
      @counts
    )
  end

  def reset do
    :ets.delete_all_objects(@table)
    :ets.delete_all_objects(@counts)
    :ok
  end

  # GenServer -------------------------------------------------------------

  @impl true
  def init(_) do
    :ets.new(@table, [
      :ordered_set, :public, :named_table,
      read_concurrency: true, write_concurrency: true
    ])

    :ets.new(@counts, [:set, :public, :named_table, write_concurrency: true])
    Phoenix.PubSub.subscribe(Hela.PubSub, "hela:reset")
    Phoenix.PubSub.subscribe(Hela.PubSub, "cache:sync")
    {:ok, %{}}
  end

  @impl true
  def handle_cast({:trim, key}, state) do
    trim(key)
    {:noreply, state}
  end

  @impl true
  def handle_info(:reset_local, state) do
    :ets.delete_all_objects(@table)
    :ets.delete_all_objects(@counts)
    {:noreply, state}
  end

  def handle_info({:cache_sync, msg}, state) do
    put(msg)
    {:noreply, state}
  end

  # Internal --------------------------------------------------------------

  defp bucket_key(project_id, channel), do: {project_id, channel}

  defp normalize_pivot(nil), do: :latest
  defp normalize_pivot(<<_::binary-size(16)>> = bin), do: bin
  defp normalize_pivot(<<_::binary-size(36)>> = s), do: Hela.ID.string_to_bin(s)

  defp select_desc(key, :latest, limit) do
    select_desc_from(key, :latest, limit)
  end

  defp select_desc(key, pivot_bin, limit) do
    case :ets.prev(@table, {key, pivot_bin}) do
      {^key, _} = k -> walk_desc(k, key, limit, [])
      _ -> []
    end
  end

  defp select_desc_from(key, :latest, limit) do
    case :ets.last(@table) do
      :"$end_of_table" -> []
      {^key, _} = k -> walk_desc(k, key, limit, [])
      other -> seek_back(other, key, limit, [])
    end
  end

  defp seek_back(k, key, limit, acc) do
    case :ets.prev(@table, k) do
      :"$end_of_table" -> acc
      {^key, _} = nxt -> walk_desc(nxt, key, limit, acc)
      nxt -> seek_back(nxt, key, limit, acc)
    end
  end

  defp walk_desc(_, _, 0, acc), do: acc

  defp walk_desc({key, _} = k, key, limit, acc) do
    [{^k, msg}] = :ets.lookup(@table, k)
    next_acc = [msg | acc]

    case :ets.prev(@table, k) do
      :"$end_of_table" -> next_acc
      {^key, _} = nxt -> walk_desc(nxt, key, limit - 1, next_acc)
      _ -> next_acc
    end
  end

  defp walk_desc(_, _, _, acc), do: acc

  defp trim(key) do
    case :ets.lookup(@counts, key) do
      [{^key, n}] when n > @max_per_channel ->
        to_drop = n - @max_per_channel
        keys = oldest_keys(key, to_drop)

        Enum.each(keys, &:ets.delete(@table, &1))
        :ets.update_counter(@counts, key, {2, -length(keys)})

      _ ->
        :ok
    end
  end

  defp oldest_keys(key, n) do
    spec = [{{{key, :"$1"}, :_}, [], [{{key, :"$1"}}]}]

    case :ets.select(@table, spec, n) do
      {rows, _cont} -> rows
      :"$end_of_table" -> []
    end
  end
end
