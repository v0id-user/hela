defmodule Hela.PlaygroundLimiter do
  @moduledoc """
  Per-IP rate limiter for the unauthenticated `/playground/*` endpoints.

  The existing `Hela.Quota` enforces per-project caps, which on the
  shared `proj_public` sandbox means one abusive client can eat the
  whole project bucket and starve legitimate landing-page visitors.
  This module adds a second layer scoped to the caller's IP so abuse
  stays contained.

  Fixed-window buckets, same shape as `Hela.Quota.check_rate/2`:
  ETS key is `{action, window, ip, bucket_index}`, value is the
  count-so-far in that bucket. Old entries are GC'd every minute.

  Limits (per IP):
    token   — 5/sec, 120/hour    (mint a playground JWT)
    publish — 3/sec, 500/hour    (push a message via REST)

  The per-second bucket stops bursts; the per-hour bucket stops
  patient attackers. The token caps allow for the legitimate
  landing-page pattern of two clients (hero ephemeral + demo
  primitives non-ephemeral) firing on first paint, plus token
  refresh cycles, plus a reasonable amount of reload churn — without
  letting a bot mint thousands per hour.

  History note: token was 1/sec, 30/hour. That bit a real user-
  facing flow because the marketing site mints two tokens
  (different `sub`, different `ephemeral` flag) within the same
  second on first load; the per-IP limiter punted one of them with
  429. Bumping to 5/sec accommodates the legitimate burst; 120/hour
  still catches sustained abuse.
  """

  use GenServer

  @table :hela_playground_rl

  # `{cap, window_seconds}` pairs per action. Every request checks
  # every pair in order; the first denial wins.
  @limits %{
    token: [{:per_sec, 5, 1}, {:per_hour, 120, 3600}],
    publish: [{:per_sec, 3, 1}, {:per_hour, 500, 3600}]
  }

  def start_link(_), do: GenServer.start_link(__MODULE__, [], name: __MODULE__)

  @doc """
  Check + consume one slot for `action` on behalf of `ip`. Returns
  `:ok` on admit, `{:error, :rate_limited, retry_after_ms}` on deny.

  Fails open if the ETS table is unavailable — the limiter is
  best-effort protection, not auth.
  """
  def check(action, ip) when action in [:token, :publish] do
    Enum.reduce_while(@limits[action], :ok, fn {name, cap, window}, _acc ->
      case bump(action, name, window, ip) do
        {:ok, n} when n <= cap ->
          {:cont, :ok}

        {:ok, _} ->
          {:halt, {:error, :rate_limited, retry_ms(window)}}

        :unavailable ->
          # ETS wedged or module not started — don't block the request.
          {:halt, :ok}
      end
    end)
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

  defp retry_ms(1), do: 1000 - rem(System.system_time(:millisecond), 1000)
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
    # Delete entries whose window ended more than 2× the window ago.
    # per-sec buckets older than 2s, per-hour buckets older than 2h.
    :ets.select_delete(@table, [
      {{{:"$1", :per_sec, :_, :"$2"}, :_}, [{:<, {:*, :"$2", 1}, now - 2}], [true]},
      {{{:"$1", :per_hour, :_, :"$2"}, :_}, [{:<, {:*, :"$2", 3600}, now - 7200}], [true]}
    ])

    {:noreply, state}
  end
end
