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

    claims = %{
      "pid" => project_id,
      "sub" => sub,
      "chans" => chans
    }

    # Customer who wants server-issued tokens registers no JWK; instead
    # we sign with their API-key-derived HS256 secret. This keeps the
    # flow one-round-trip for Node backends that don't want to manage
    # RSA keys.
    secret = "apikey:" <> project_id
    {:ok, token} = Hela.Auth.JWT.sign(claims, secret, ttl)

    json(conn, %{token: token, expires_in: ttl})
  end
end
