defmodule Control.Accounts.Project do
  use Ecto.Schema
  import Ecto.Changeset

  @regions ~w(iad sjc ams sin syd)
  @tiers ~w(free starter growth scale ent)

  @primary_key {:id, :string, autogenerate: false}

  schema "projects" do
    field :account_id, :string
    field :name, :string
    field :region, :string
    field :tier, :string, default: "free"
    field :multi_region, {:array, :string}, default: []
    field :polar_subscription_id, :string
    field :jwt_public_key_jwk, :map
    field :jwt_signing_secret, :string
    field :inserted_at, :utc_datetime
    field :updated_at, :utc_datetime
  end

  def regions, do: @regions
  def tiers, do: @tiers

  @doc "Generate a fresh per-project HS256 secret. 32 bytes, hex-encoded."
  def new_signing_secret do
    :crypto.strong_rand_bytes(32) |> Base.encode16(case: :lower)
  end

  def create_changeset(attrs) do
    now = DateTime.utc_now() |> DateTime.truncate(:second)

    %__MODULE__{id: Control.ID.short_project_id()}
    |> cast(attrs, [:account_id, :name, :region, :tier])
    |> validate_required([:account_id, :name, :region])
    |> validate_inclusion(:region, @regions)
    |> validate_inclusion(:tier, @tiers)
    |> put_change(:jwt_signing_secret, new_signing_secret())
    |> put_change(:inserted_at, now)
    |> put_change(:updated_at, now)
  end

  def rotate_secret_changeset(project) do
    change(project,
      jwt_signing_secret: new_signing_secret(),
      updated_at: DateTime.utc_now() |> DateTime.truncate(:second)
    )
  end

  def update_changeset(project, attrs) do
    project
    |> cast(attrs, [:name, :tier, :jwt_public_key_jwk])
    |> validate_inclusion(:tier, @tiers)
    |> put_change(:updated_at, DateTime.utc_now() |> DateTime.truncate(:second))
  end
end
