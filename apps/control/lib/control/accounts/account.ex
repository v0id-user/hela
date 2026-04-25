defmodule Control.Accounts.Account do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :string, autogenerate: false}

  schema "accounts" do
    field :email, :string
    field :password, :string, virtual: true, redact: true
    field :password_hash, :string, redact: true
    field :github_id, :string
    field :polar_customer_id, :string
    field :inserted_at, :utc_datetime
    field :updated_at, :utc_datetime
  end

  def signup_changeset(attrs) do
    now = DateTime.utc_now() |> DateTime.truncate(:second)

    %__MODULE__{id: Control.ID.generate()}
    |> cast(attrs, [:email, :password, :github_id], empty_values: [""])
    |> validate_required([:email, :password])
    |> validate_format(:email, ~r/@/)
    |> validate_length(:password, min: 8, max: 200)
    |> unique_constraint(:email)
    |> put_change(:inserted_at, now)
    |> put_change(:updated_at, now)
    |> hash_password()
  end

  def password_changeset(account, password) when byte_size(password) >= 8 do
    change(account, password_hash: Bcrypt.hash_pwd_salt(password))
  end

  # Constant-time comparison; uses `Bcrypt.no_user_verify/0` when the
  # account row has no password_hash so timing on "no such email" is
  # indistinguishable from "wrong password".
  def verify_password(%__MODULE__{password_hash: hash}, password)
      when is_binary(hash) and is_binary(password) do
    if Bcrypt.verify_pass(password, hash), do: :ok, else: :error
  end

  def verify_password(_, _) do
    Bcrypt.no_user_verify()
    :error
  end

  defp hash_password(changeset) do
    case get_change(changeset, :password) do
      pw when is_binary(pw) ->
        changeset
        |> put_change(:password_hash, Bcrypt.hash_pwd_salt(pw))
        |> delete_change(:password)

      _ ->
        changeset
    end
  end
end
