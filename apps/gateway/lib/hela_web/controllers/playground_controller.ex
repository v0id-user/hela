defmodule HelaWeb.PlaygroundController do
  @moduledoc """
  Public, no-auth endpoints the hela.dev landing page uses to drive its
  live demos. Everything here writes into the `proj_public` sandbox.

  Rate limiting is on the project's `Hela.Quota` counters plus TCP-level
  connection caps on the load balancer — no per-IP limiter in this layer.
  """

  use HelaWeb, :controller

  alias Hela.Auth.Playground
  alias Hela.Channels

  def token(conn, params) do
    {:ok, token} = Playground.issue_guest_token(sub: params["sub"])

    json(conn, %{
      token: token,
      project_id: Playground.project_id(),
      expires_in: 300,
      scopes: [
        %{scope: "read",  pattern: "hello:**"},
        %{scope: "write", pattern: "hello:**"},
        %{scope: "read",  pattern: "demo:**"},
        %{scope: "write", pattern: "demo:**"}
      ]
    })
  end

  def history(conn, %{"channel" => channel} = params) do
    before = params["before"]
    limit = min(String.to_integer(params["limit"] || "50"), 100)
    {source, messages} = Channels.history(Playground.project_id(), channel, before, limit)

    json(conn, %{source: source, messages: messages})
  end

  def publish(conn, %{"channel" => channel, "body" => body} = params) do
    author = params["author"] || "guest"

    case Channels.publish(%{
           project_id: Playground.project_id(),
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
