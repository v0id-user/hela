defmodule Control.Accounts do
  @moduledoc """
  Canonical owner of accounts, projects, and API keys. Every mutation
  ends with a fan-out to the gateways in the project's region so the
  data plane's local mirror stays fresh.
  """

  alias Control.Accounts.{Account, Project, APIKey}
  alias Control.{Repo, Sync, Billing}
  import Ecto.Query

  # --- accounts -------------------------------------------------------

  def create_account(email, opts \\ []) do
    with {:ok, account} <-
           Account.signup_changeset(%{email: email, github_id: opts[:github_id]})
           |> Repo.insert(),
         {:ok, account} <- Billing.ensure_customer(account) do
      {:ok, account}
    end
  end

  def get_account(id), do: Repo.get(Account, id)
  def get_account_by_email(email), do: Repo.get_by(Account, email: email)

  # --- projects -------------------------------------------------------

  def list_projects(account_id) do
    Repo.all(from p in Project, where: p.account_id == ^account_id, order_by: [asc: p.inserted_at])
  end

  def get_project(id), do: Repo.get(Project, id)

  def create_project(account_id, attrs) do
    attrs = Map.put(attrs, :account_id, account_id)

    with {:ok, project} <- Project.create_changeset(attrs) |> Repo.insert(),
         {:ok, project} <- Billing.attach_subscription_item(project),
         :ok <- Sync.push_project(project) do
      {:ok, project}
    end
  end

  def update_project(%Project{} = project, attrs) do
    with {:ok, project} <- Project.update_changeset(project, attrs) |> Repo.update(),
         :ok <- Sync.push_project(project) do
      {:ok, project}
    end
  end

  def delete_project(%Project{} = project) do
    with :ok <- Billing.cancel_subscription_item(project),
         {:ok, _} <- Repo.delete(project),
         :ok <- Sync.delete_project(project) do
      :ok
    end
  end

  # --- api keys -------------------------------------------------------

  def create_api_key(%Project{} = project, label \\ nil) do
    {:ok, row, wire} = APIKey.new(project.id, label)

    with {:ok, saved} <- Repo.insert(row),
         :ok <- Sync.push_api_key(saved, project.region) do
      {:ok, saved, wire}
    end
  end

  def list_api_keys(project_id) do
    Repo.all(
      from k in APIKey,
        where: k.project_id == ^project_id and is_nil(k.revoked_at),
        order_by: [desc: k.inserted_at]
    )
  end

  def revoke_api_key(id) do
    case Repo.get(APIKey, id) do
      nil ->
        {:error, :not_found}

      key ->
        {:ok, updated} =
          key
          |> Ecto.Changeset.change(revoked_at: DateTime.utc_now() |> DateTime.truncate(:second))
          |> Repo.update()

        project = get_project(updated.project_id)
        :ok = Sync.revoke_api_key(updated, project && project.region)
        {:ok, updated}
    end
  end

end
