defmodule Hela.Chat.Pipeline do
  @moduledoc """
  Broadway consumer that batches ingested messages into Postgres.

  Hot path calls `push/2`. Batcher flushes every 1000 messages or 200ms,
  whichever comes first, via a single `Repo.insert_all/3`. Latency of the
  ingest→persisted span is recorded via the `t0` monotonic time carried on
  each message.
  """

  use Broadway

  alias Broadway.Message
  alias Hela.Chat.Message, as: ChatMessage
  alias Hela.Repo

  @producer Broadway.DummyProducer

  def start_link(_opts) do
    Broadway.start_link(__MODULE__,
      name: __MODULE__,
      producer: [module: {@producer, []}, concurrency: 1],
      processors: [default: [concurrency: 2]],
      batchers: [
        db: [concurrency: 1, batch_size: 1000, batch_timeout: 200]
      ]
    )
  end

  def push(%ChatMessage{} = msg, t0) do
    Broadway.push_messages(__MODULE__, [
      %Message{
        data: {msg, t0},
        acknowledger: Broadway.NoopAcknowledger.init()
      }
    ])
  end

  def queue_depth do
    case Process.whereis(__MODULE__) do
      nil ->
        0

      pid ->
        case Process.info(pid, :message_queue_len) do
          {_, n} -> n
          _ -> 0
        end
    end
  end

  @impl true
  def handle_message(_, msg, _), do: Message.put_batcher(msg, :db)

  @impl true
  def handle_batch(:db, messages, _, _) do
    rows = Enum.map(messages, fn %Message{data: {m, _}} -> ChatMessage.to_row(m) end)

    case Repo.insert_all(ChatMessage, rows, on_conflict: :nothing) do
      {_inserted, _} ->
        now = System.monotonic_time(:microsecond)

        :telemetry.execute(
          [:hela, :batch, :persisted],
          %{count: length(rows)},
          %{}
        )

        for %Message{data: {_m, t0}} <- messages do
          Hela.Latency.observe(:persist, now - t0)
        end
    end

    messages
  rescue
    e ->
      # Persistence failure is non-fatal — the ETS cache and broadcast
      # already served the live subscribers. We just lose the cold-tier
      # entry for this batch. Log and move on.
      require Logger
      Logger.error("persist batch failed: #{inspect(e)}")
      messages
  end
end
