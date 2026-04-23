defmodule ControlWeb.KeysController do
  use ControlWeb, :controller

  alias Control.Accounts

  def index(conn, %{"id" => project_id}) do
    with {:ok, project} <- own(conn, project_id) do
      keys =
        Accounts.list_api_keys(project.id)
        |> Enum.map(&shape_key/1)

      json(conn, %{keys: keys})
    end
  end

  def create(conn, %{"id" => project_id} = params) do
    with {:ok, project} <- own(conn, project_id),
         {:ok, row, wire} <- Accounts.create_api_key(project, params["label"]) do
      json(conn, %{key: shape_key(row), wire: wire})
    else
      :not_found -> conn |> put_status(404) |> json(%{error: "not_found"})
      {:error, reason} -> conn |> put_status(400) |> json(%{error: inspect(reason)})
    end
  end

  def revoke(conn, %{"id" => project_id, "key_id" => key_id}) do
    with {:ok, _project} <- own(conn, project_id),
         {:ok, _} <- Accounts.revoke_api_key(key_id) do
      json(conn, %{ok: true})
    else
      _ -> conn |> put_status(404) |> json(%{error: "not_found"})
    end
  end

  defp own(conn, project_id) do
    case Accounts.get_project(project_id) do
      %{account_id: aid} = p when aid == conn.assigns.account.id -> {:ok, p}
      _ -> :not_found
    end
  end

  defp shape_key(k) do
    Map.take(k, [:id, :prefix, :label, :last_used_at, :revoked_at, :inserted_at])
  end
end
