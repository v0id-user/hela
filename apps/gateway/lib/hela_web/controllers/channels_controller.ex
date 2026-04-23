defmodule HelaWeb.ChannelsController do
  @moduledoc """
  REST shims for server-side publishes and history reads.

  Every request lands with `conn.assigns.project_id` already resolved by
  `APIKeyAuth`. The controller never reads project_id from the URL or
  body — one call to `Hela.Channels` and we're done.
  """

  use HelaWeb, :controller

  alias Hela.Channels

  def history(conn, %{"channel" => channel} = params) do
    before = params["before"]
    limit = min(String.to_integer(params["limit"] || "50"), 100)
    {source, messages} = Channels.history(conn.assigns.project_id, channel, before, limit)
    json(conn, %{source: source, messages: messages})
  end

  def publish(conn, %{"channel" => channel, "body" => body} = params) do
    author = params["author"] || "server"

    case Channels.publish(%{
           project_id: conn.assigns.project_id,
           channel: channel,
           author: author,
           body: body,
           reply_to_id: params["reply_to_id"]
         }) do
      {:ok, wire, quota} ->
        json(conn, %{id: wire.id, inserted_at: wire.inserted_at, quota: quota})

      {:error, {:rate_limited, retry_ms}} ->
        conn
        |> put_resp_header("retry-after", to_string(div(retry_ms, 1000) + 1))
        |> put_status(429)
        |> json(%{error: "rate_limited", retry_after_ms: retry_ms})

      {:error, reason} ->
        conn |> put_status(400) |> json(%{error: reason})
    end
  end
end
