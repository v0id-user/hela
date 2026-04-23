defmodule HelaWeb.InternalController do
  @moduledoc """
  Control-plane → gateway sync endpoints. These are NOT customer-facing;
  the plug `InternalAuth` checks a shared secret header before any of
  these run. Control calls them when a project is created, its tier
  changes, its JWK is updated, an API key is issued, etc.
  """

  use HelaWeb, :controller

  def upsert_project(conn, params) do
    Hela.Projects.upsert(%{
      id: params["id"],
      account_id: params["account_id"],
      tier: params["tier"] || "free",
      region: params["region"],
      jwt_public_key_jwk: params["jwt_public_key_jwk"]
    })

    json(conn, %{ok: true})
  end

  def delete_project(conn, %{"id" => id}) do
    Hela.Projects.delete(id)
    json(conn, %{ok: true})
  end

  def upsert_api_key(conn, params) do
    {:ok, _} =
      Hela.APIKeys.upsert(%{
        id: params["id"],
        project_id: params["project_id"],
        prefix: params["prefix"],
        hashed_secret: params["hashed_secret"]
      })

    json(conn, %{ok: true})
  end

  def revoke_api_key(conn, %{"id" => id}) do
    Hela.APIKeys.revoke(id)
    json(conn, %{ok: true})
  end
end
