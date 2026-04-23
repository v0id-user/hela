defmodule Control.Accounts.APIKey do
  @moduledoc """
  Canonical API key row. The plaintext secret is shown to the user ONCE
  at creation time; we persist the bcrypt hash. On creation we push the
  prefix + hash down to every gateway in the project's region so the
  regional cluster can authenticate without a control-plane round-trip.
  """

  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :string, autogenerate: false}

  schema "api_keys" do
    field :project_id, :string
    field :prefix, :string
    field :hashed_secret, :string
    field :label, :string
    field :last_used_at, :utc_datetime
    field :revoked_at, :utc_datetime
    field :inserted_at, :utc_datetime
  end

  def new(project_id, label \\ nil) do
    prefix = random_b32(6)
    secret = random_b32(32)
    hash = Bcrypt.hash_pwd_salt(secret)

    row =
      %__MODULE__{id: Control.ID.generate()}
      |> change(
        project_id: project_id,
        prefix: prefix,
        hashed_secret: hash,
        label: label,
        inserted_at: DateTime.utc_now() |> DateTime.truncate(:second)
      )

    wire = "hk_#{prefix}_#{secret}"
    {:ok, row, wire}
  end

  defp random_b32(n) do
    :crypto.strong_rand_bytes(n)
    |> Base.encode32(case: :lower, padding: false)
    |> binary_part(0, n)
  end
end
