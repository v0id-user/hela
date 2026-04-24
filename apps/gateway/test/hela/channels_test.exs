defmodule Hela.ChannelsTest do
  use Hela.DataCase, async: false

  alias Hela.Channels
  alias Hela.Chat.{Cache, Message}
  alias Hela.Repo

  setup do
    Cache.reset()
    :ok
  end

  test "ephemeral publish still broadcasts but skips cache and DB persistence" do
    project_id = "proj_public"
    channel = "hello:world"

    {:ok, wire, :ok} =
      Channels.publish(%{
        project_id: project_id,
        channel: channel,
        author: "guest",
        body: "ephemeral hello",
        ephemeral: true
      })

    assert wire.body == "ephemeral hello"
    assert {_, []} = Channels.history(project_id, channel, nil, 10)

    assert [] =
             Repo.all(
               from m in Message, where: m.project_id == ^project_id and m.channel == ^channel
             )
  end

  test "non-ephemeral publish still populates cache" do
    project_id = "proj_public"
    channel = "demo:history"

    {:ok, wire, :ok} =
      Channels.publish(%{
        project_id: project_id,
        channel: channel,
        author: "guest",
        body: "normal hello"
      })

    assert wire.body == "normal hello"
    assert {_source, [msg]} = Channels.history(project_id, channel, nil, 10)
    assert msg.body == "normal hello"
  end

  test "ephemeral_history returns an empty history payload" do
    assert {:cache, []} = Channels.ephemeral_history()
  end
end
