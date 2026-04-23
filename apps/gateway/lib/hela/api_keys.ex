defmodule Hela.APIKeys do
  @moduledoc """
  Gateway-local read model of API keys. Canonical owner is the control
  plane; control pushes inserts/revokes via `/_internal/api_keys`.

  Lookup is by prefix; comparison is constant-time against the hashed
  secret. Touch of last_used_at is not mirrored back to control at v1 —
  control exposes a coarse `last_seen_at` off gateway metrics if we ever
  need it in the dashboard.
  """

  use Ecto.Schema
  import Ecto.Query
  alias Hela.Repo

  @primary_key {:id, :string, autogenerate: false}
  schema "api_keys_cache" do
    field :project_id, :string
    field :prefix, :string
    field :hashed_secret, :string
    field :revoked_at, :utc_datetime
  end

  def upsert(attrs) do
    changeset =
      struct(__MODULE__, attrs)

    Repo.insert(changeset,
      on_conflict: {:replace, [:project_id, :prefix, :hashed_secret, :revoked_at]},
      conflict_target: :id
    )
  end

  def revoke(id) do
    Repo.update_all(
      from(k in __MODULE__, where: k.id == ^id),
      set: [revoked_at: DateTime.utc_now() |> DateTime.truncate(:second)]
    )
  end

  @doc "Authenticate an `hk_prefix_secret` string against the mirror."
  def authenticate("hk_" <> rest) do
    with [prefix, secret] <- String.split(rest, "_", parts: 2),
         %__MODULE__{revoked_at: nil} = row <-
           Repo.one(from k in __MODULE__, where: k.prefix == ^prefix),
         true <- Bcrypt.verify_pass(secret, row.hashed_secret) do
      {:ok, row.project_id}
    else
      _ -> :invalid
    end
  end

  def authenticate(_), do: :invalid
end
