defmodule Hela.Chat.Message do
  @moduledoc """
  A published message on a (project, channel) pair.

  Primary key is a UUIDv7 generated at ingest. Everything downstream —
  cache, persisted row, wire frame, reply_to pointers — uses the same id.
  """

  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: false}
  @foreign_key_type :binary_id

  schema "messages" do
    field :project_id, :string
    field :channel, :string
    field :author, :string
    field :body, :string
    field :reply_to_id, :binary_id
    field :node, :string
    field :inserted_at, :utc_datetime_usec
  end

  def new(attrs) do
    %__MODULE__{
      id: Hela.ID.generate_bin(),
      project_id: Map.fetch!(attrs, :project_id),
      channel: Map.fetch!(attrs, :channel),
      author: Map.fetch!(attrs, :author),
      body: Map.fetch!(attrs, :body),
      reply_to_id: normalize(attrs[:reply_to_id]),
      node: to_string(node()),
      inserted_at: DateTime.utc_now()
    }
  end

  def to_wire(%__MODULE__{} = m) do
    %{
      id: uuid_to_string(m.id),
      channel: m.channel,
      author: m.author,
      body: m.body,
      reply_to_id: uuid_to_string(m.reply_to_id),
      node: m.node,
      inserted_at: DateTime.to_iso8601(m.inserted_at)
    }
  end

  def to_row(%__MODULE__{} = m) do
    %{
      id: uuid_to_string(m.id),
      project_id: m.project_id,
      channel: m.channel,
      author: m.author,
      body: m.body,
      reply_to_id: uuid_to_string(m.reply_to_id),
      node: m.node,
      inserted_at: m.inserted_at
    }
  end

  defp normalize(nil), do: nil
  defp normalize(<<_::binary-size(16)>> = b), do: b
  defp normalize(<<_::binary-size(36)>> = s), do: Hela.ID.string_to_bin(s)

  defp uuid_to_string(nil), do: nil
  defp uuid_to_string(<<_::binary-size(16)>> = b), do: Hela.ID.bin_to_string(b)
  defp uuid_to_string(<<_::binary-size(36)>> = s), do: s
end
