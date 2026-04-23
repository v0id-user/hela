defmodule Hela.Projects do
  @moduledoc """
  Gateway-local cache of project configuration (region, tier, JWT pubkey).

  Canonical source of truth lives in the `control` app's Postgres database.
  Control syncs via HTTP POST to `/_internal/projects` on every gateway in
  the project's region whenever a project is created, its tier changes, or
  its JWK is re-registered.

  The gateway never originates project rows — it only consumes them — so
  there's no write contention with the control plane. On cold miss (no
  local row) we fall back to pulling from control's internal API.
  """

  use GenServer
  import Ecto.Query
  alias Hela.Repo

  @table :hela_projects_cache

  defmodule Row do
    use Ecto.Schema

    @primary_key {:id, :string, autogenerate: false}
    schema "projects_cache" do
      field :account_id, :string
      field :tier, :string, default: "free"
      field :region, :string
      field :jwt_public_key_jwk, :map
      field :jwt_signing_secret, :string
      field :updated_at, :utc_datetime
    end
  end

  def start_link(_), do: GenServer.start_link(__MODULE__, [], name: __MODULE__)

  def get(project_id) do
    case :ets.lookup(@table, project_id) do
      [{_, row}] -> row
      _ -> reload(project_id)
    end
  end

  def fetch_jwk(project_id) do
    case get(project_id) do
      nil -> {:error, :no_project}
      %{jwt_public_key_jwk: nil} -> {:error, :no_jwk}
      %{jwt_public_key_jwk: jwk} -> {:ok, jwk}
    end
  end

  @doc """
  Per-project HS256 signing secret. Canonical source is the control
  plane; control pushes it via the sync endpoint. Used both to verify
  server-issued tokens and to sign new ones at `/v1/tokens`.
  """
  def fetch_signing_secret(project_id) do
    case get(project_id) do
      %{jwt_signing_secret: s} when is_binary(s) and byte_size(s) > 0 -> {:ok, s}
      _ -> {:error, :no_secret}
    end
  end

  def tier(project_id) do
    case get(project_id) do
      nil -> "free"
      %{tier: t} -> t
    end
  end

  @doc """
  Called by the internal sync endpoint when control pushes a project
  upsert. Writes-through to Postgres + refreshes the ETS cache.
  """
  def upsert(attrs) do
    GenServer.call(__MODULE__, {:upsert, attrs})
  end

  def delete(project_id) do
    GenServer.call(__MODULE__, {:delete, project_id})
  end

  # GenServer -----------------------------------------------------------

  @impl true
  def init(_) do
    :ets.new(@table, [:set, :public, :named_table, read_concurrency: true])
    warm_from_db()
    {:ok, %{}}
  end

  @impl true
  def handle_call({:upsert, attrs}, _, state) do
    row = struct(Row, Map.put(attrs, :updated_at, DateTime.utc_now() |> DateTime.truncate(:second)))

    Repo.insert!(row,
      on_conflict:
        {:replace,
         [:tier, :region, :jwt_public_key_jwk, :jwt_signing_secret, :updated_at, :account_id]},
      conflict_target: :id
    )

    :ets.insert(@table, {row.id, row})
    {:reply, :ok, state}
  end

  def handle_call({:delete, id}, _, state) do
    Repo.delete_all(from r in Row, where: r.id == ^id)
    :ets.delete(@table, id)
    {:reply, :ok, state}
  end

  defp warm_from_db do
    Repo.all(Row)
    |> Enum.each(fn row -> :ets.insert(@table, {row.id, row}) end)
  rescue
    _ -> :ok
  end

  defp reload(project_id) do
    case Repo.get(Row, project_id) do
      nil -> nil
      row ->
        :ets.insert(@table, {row.id, row})
        row
    end
  rescue
    _ -> nil
  end
end
