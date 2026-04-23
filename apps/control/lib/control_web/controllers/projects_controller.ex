defmodule ControlWeb.ProjectsController do
  use ControlWeb, :controller

  alias Control.Accounts

  def index(conn, _) do
    projects = Accounts.list_projects(conn.assigns.account.id)
    json(conn, %{projects: Enum.map(projects, &shape/1)})
  end

  def show(conn, %{"id" => id}) do
    case load_own(conn, id) do
      {:ok, p} -> json(conn, %{project: shape(p)})
      :not_found -> not_found(conn)
    end
  end

  def create(conn, params) do
    case Accounts.create_project(conn.assigns.account.id, %{
           name: params["name"],
           region: params["region"],
           tier: params["tier"] || "free"
         }) do
      {:ok, p} ->
        json(conn, %{project: shape(p)})

      {:error, reason} ->
        conn |> put_status(400) |> json(%{error: inspect(reason)})
    end
  end

  def update(conn, %{"id" => id} = params) do
    with {:ok, p} <- load_own(conn, id),
         {:ok, p} <- Accounts.update_project(p, Map.take(params, ["name", "tier"])) do
      json(conn, %{project: shape(p)})
    else
      :not_found -> not_found(conn)
      {:error, reason} -> conn |> put_status(400) |> json(%{error: inspect(reason)})
    end
  end

  def set_jwk(conn, %{"id" => id, "jwk" => jwk}) when is_map(jwk) do
    with {:ok, p} <- load_own(conn, id),
         {:ok, p} <- Accounts.update_project(p, %{jwt_public_key_jwk: jwk}) do
      json(conn, %{project: shape(p)})
    else
      :not_found -> not_found(conn)
      {:error, reason} -> conn |> put_status(400) |> json(%{error: inspect(reason)})
    end
  end

  def delete(conn, %{"id" => id}) do
    case load_own(conn, id) do
      {:ok, p} ->
        :ok = Accounts.delete_project(p)
        json(conn, %{ok: true})

      :not_found ->
        not_found(conn)
    end
  end

  defp load_own(conn, id) do
    case Accounts.get_project(id) do
      nil -> :not_found
      %{account_id: aid} = p when aid == conn.assigns.account.id -> {:ok, p}
      _ -> :not_found
    end
  end

  defp not_found(conn), do: conn |> put_status(404) |> json(%{error: "not_found"})

  defp shape(p) do
    Map.take(p, [:id, :name, :region, :tier, :multi_region, :inserted_at, :updated_at])
    |> Map.put(:jwt_registered, not is_nil(p.jwt_public_key_jwk))
  end
end
