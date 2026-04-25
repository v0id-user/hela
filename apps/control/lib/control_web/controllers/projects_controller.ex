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
      {:error, %Ecto.Changeset{} = cs} -> changeset_error(conn, cs)
      {:error, reason} -> conn |> put_status(400) |> json(%{error: inspect(reason)})
    end
  end

  def set_jwk(conn, %{"id" => id, "jwk" => jwk}) when is_map(jwk) do
    with {:ok, p} <- load_own(conn, id),
         {:ok, p} <- Accounts.update_project(p, %{jwt_public_key_jwk: jwk}) do
      json(conn, %{project: shape(p)})
    else
      :not_found -> not_found(conn)
      {:error, %Ecto.Changeset{} = cs} -> changeset_error(conn, cs)
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

  @doc """
  Start a Polar Checkout session for a paid-tier project. The dashboard
  redirects the user to the returned `url`; on completion Polar sends a
  `subscription.created` webhook which we store against the project.

  For Free-tier projects this returns `{url: nil}` — nothing to charge.
  """
  def checkout(conn, %{"id" => id} = params) do
    success =
      params["success_url"] ||
        "https://app-production-1716a.up.railway.app/projects/#{id}?checkout=ok"

    with {:ok, p} <- load_own(conn, id),
         {:ok, url} <- Control.Billing.start_checkout(p, success) do
      json(conn, %{url: url, tier: p.tier})
    else
      :not_found -> not_found(conn)
      {:error, reason} -> conn |> put_status(400) |> json(%{error: inspect(reason)})
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

  # Surface changeset validation errors as a readable string the
  # frontend can show inline, plus a structured `details` map keyed
  # by field for programmatic use. Avoids dumping the raw Ecto
  # changeset (which is what `inspect/1` was producing before).
  defp changeset_error(conn, %Ecto.Changeset{} = cs) do
    details =
      Ecto.Changeset.traverse_errors(cs, fn {msg, opts} ->
        Regex.replace(~r"%\{(\w+)\}", msg, fn _, key ->
          opts |> Keyword.get(String.to_existing_atom(key), key) |> to_string()
        end)
      end)

    summary =
      details
      |> Enum.map_join("; ", fn {field, [msg | _]} -> "#{field}: #{msg}" end)

    conn |> put_status(400) |> json(%{error: summary, details: details})
  end

  defp shape(p) do
    Map.take(p, [:id, :name, :region, :tier, :multi_region, :inserted_at, :updated_at])
    |> Map.put(:jwt_registered, not is_nil(p.jwt_public_key_jwk))
  end
end
