defmodule Control.Accounts.Project do
  use Ecto.Schema
  import Ecto.Changeset

  @regions ~w(iad sjc fra sin syd)
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
    field :inserted_at, :utc_datetime
    field :updated_at, :utc_datetime
  end

  def regions, do: @regions
  def tiers, do: @tiers

  def create_changeset(attrs) do
    now = DateTime.utc_now() |> DateTime.truncate(:second)

    %__MODULE__{id: Control.ID.short_project_id()}
    |> cast(attrs, [:account_id, :name, :region, :tier])
    |> validate_required([:account_id, :name, :region])
    |> validate_inclusion(:region, @regions)
    |> validate_inclusion(:tier, @tiers)
    |> put_change(:inserted_at, now)
    |> put_change(:updated_at, now)
  end

  def update_changeset(project, attrs) do
    project
    |> cast(attrs, [:name, :tier, :jwt_public_key_jwk])
    |> validate_inclusion(:tier, @tiers)
    |> put_change(:updated_at, DateTime.utc_now() |> DateTime.truncate(:second))
  end
end
