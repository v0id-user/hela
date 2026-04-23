defmodule HelaWeb.TokensController do
  @moduledoc """
  Server-side grant helper. The customer's backend calls `POST /v1/tokens`
  with an API key in the Authorization header and a body describing the
  scopes their user should have; we sign and return a JWT.

  Customers who prefer to sign their own can skip this endpoint entirely
  — they just register their JWK and sign with their private key. We
  never see the secret in that flow.
  """

  use HelaWeb, :controller

  def create(conn, params) do
    project_id = conn.assigns.project_id
    sub = params["sub"] || raise "sub required"
    ttl = min(params["ttl_seconds"] || 3600, 24 * 3600)
    chans = Map.get(params, "chans", [])

    claims = %{"pid" => project_id, "sub" => sub, "chans" => chans}

    # Per-project HS256 secret (32 random bytes hex-encoded) generated
    # at project creation by the control plane. Gateway holds it in its
    # local `projects_cache` via the /_internal/projects sync.
    case Hela.Projects.fetch_signing_secret(project_id) do
      {:ok, secret} ->
        {:ok, token} = Hela.Auth.JWT.sign(claims, secret, ttl)
        json(conn, %{token: token, expires_in: ttl})

      {:error, :no_secret} ->
        conn
        |> put_status(500)
        |> json(%{
          error: "project_not_synced",
          detail:
            "the project exists but its signing secret hasn't landed on this gateway yet. try again in a moment."
        })
    end
  end
end
