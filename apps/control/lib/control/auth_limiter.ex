defmodule Control.AuthLimiter do
  @moduledoc """
  Small fixed-window limiter for unauthenticated auth endpoints.

  It protects hosted signup/login from trivial abuse without adding an
  external dependency. Limits are per client IP and fail open if ETS is not
  available; this is abuse protection, not authorization.
  """

  use GenServer

  @table :control_auth_limiter
  @limits %{
    signup: [{:per_minute, 5, 60}, {:per_hour, 50, 3600}],
    login: [{:per_minute, 20, 60}, {:per_hour, 200, 3600}]
  }

  def start_link(_), do: GenServer.start_link(__MODULE__, [], name: __MODULE__)

  def check(action, ip) when action in [:signup, :login] do
    Enum.reduce_while(@limits[action], :ok, fn {name, cap, window}, _acc ->
      case bump(action, name, window, ip) do
        {:ok, n} when n <= cap -> {:cont, :ok}
        {:ok, _} -> {:halt, {:error, :rate_limited, retry_ms(window)}}
        :unavailable -> {:halt, :ok}
      end
    end)
  end

  def reset do
    :ets.delete_all_objects(@table)
    :ok
  rescue
    ArgumentError -> :ok
  end

  defp bump(action, name, window, ip) do
    bucket = div(System.system_time(:second), window)
    key = {action, name, ip, bucket}

    try do
      {:ok, :ets.update_counter(@table, key, {2, 1}, {key, 0})}
    rescue
      ArgumentError -> :unavailable
    end
  end

  defp retry_ms(60), do: 60_000
  defp retry_ms(3600), do: 60_000

  @impl true
  def init(_) do
    :ets.new(@table, [:set, :public, :named_table, write_concurrency: true])
    :timer.send_interval(60_000, :gc)
    {:ok, %{}}
  end

  @impl true
  def handle_info(:gc, state) do
    now = System.system_time(:second)

    :ets.select_delete(@table, [
      {{{:_, :per_minute, :_, :"$1"}, :_}, [{:<, {:*, :"$1", 60}, now - 120}], [true]},
      {{{:_, :per_hour, :_, :"$1"}, :_}, [{:<, {:*, :"$1", 3600}, now - 7200}], [true]}
    ])

    {:noreply, state}
  end
end
