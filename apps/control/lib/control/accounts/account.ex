defmodule Control.Accounts.Account do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :string, autogenerate: false}

  schema "accounts" do
    field :email, :string
    field :password_hash, :string
    field :github_id, :string
    field :polar_customer_id, :string
    field :inserted_at, :utc_datetime
    field :updated_at, :utc_datetime
  end

  def signup_changeset(attrs) do
    now = DateTime.utc_now() |> DateTime.truncate(:second)

    %__MODULE__{id: Control.ID.generate()}
    |> cast(attrs, [:email, :github_id])
    |> validate_required([:email])
    |> validate_format(:email, ~r/@/)
    |> unique_constraint(:email)
    |> put_change(:inserted_at, now)
    |> put_change(:updated_at, now)
  end

  def password_changeset(account, password) when byte_size(password) >= 8 do
    change(account, password_hash: Bcrypt.hash_pwd_salt(password))
  end
end
