defmodule Hela.Chat.MessageTest do
  @moduledoc """
  Persisted messages come back from Ecto with UUID strings, while the hot-path
  cache keeps 16-byte binaries. Wire serialization has to accept both or old
  channels crash the first time history falls through to Postgres.
  """
  use ExUnit.Case, async: true

  alias Hela.Chat.Message
  alias Hela.ID

  test "to_wire/1 accepts DB-loaded UUID strings" do
    id = ID.generate()
    reply_to_id = ID.generate()
    inserted_at = DateTime.utc_now()

    wire =
      Message.to_wire(%Message{
        id: id,
        project_id: "proj_public",
        channel: "hello:world",
        author: "guest",
        body: "hi",
        reply_to_id: reply_to_id,
        node: "hela@test",
        inserted_at: inserted_at
      })

    assert wire.id == id
    assert wire.reply_to_id == reply_to_id
    assert wire.inserted_at == DateTime.to_iso8601(inserted_at)
  end

  test "to_wire/1 still accepts in-memory UUID binaries" do
    id = ID.generate_bin()
    reply_to_id = ID.generate_bin()

    wire =
      Message.to_wire(%Message{
        id: id,
        project_id: "proj_public",
        channel: "demo:history",
        author: "guest",
        body: "hi",
        reply_to_id: reply_to_id,
        node: "hela@test",
        inserted_at: DateTime.utc_now()
      })

    assert wire.id == ID.bin_to_string(id)
    assert wire.reply_to_id == ID.bin_to_string(reply_to_id)
  end
end
