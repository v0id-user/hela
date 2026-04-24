defmodule HelaWeb.PlaygroundController do
  @moduledoc """
  Public, no-auth endpoints the marketing site's landing page uses to
  drive its live demos. Everything here writes into the `proj_public`
  sandbox.

  Rate limiting is two layers: `Hela.Quota` enforces the per-project
  cap (shared across all playground visitors), and the per-route plug
  `HelaWeb.Plugs.PlaygroundRateLimit` adds per-IP buckets so one noisy
  visitor cannot starve the project's whole quota.
  """

  use HelaWeb, :controller

  alias Hela.Auth.Playground
  alias Hela.Channels

  def token(conn, params) do
    {:ok, token} =
      Playground.issue_guest_token(
        sub: params["sub"],
        ephemeral: params["ephemeral"] == true
      )

    json(conn, %{
      token: token,
      project_id: Playground.project_id(),
      expires_in: 300,
      ephemeral: params["ephemeral"] == true,
      scopes: [
        %{scope: "read", pattern: "hello:**"},
        %{scope: "write", pattern: "hello:**"},
        %{scope: "read", pattern: "demo:**"},
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
