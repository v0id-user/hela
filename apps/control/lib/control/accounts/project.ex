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
    |> validate_jwk_is_public(:jwt_public_key_jwk)
    |> put_change(:updated_at, DateTime.utc_now() |> DateTime.truncate(:second))
  end

  @doc """
  Validate that the JWK in `field` is the **public** half of an
  asymmetric key pair, never a private key and never a symmetric
  secret. Customers register their JWK so the gateway can verify
  tokens they sign on their backend; only the public half belongs
  here.

  Accepted shapes (per RFC 7517 / 7518):

    * `kty=RSA` with `n` and `e` and **no `d`**
    * `kty=EC` with `crv`, `x`, `y` and **no `d`**
    * `kty=OKP` with `crv`, `x` and **no `d`** (Ed25519 / Ed448)

  Rejected:

    * any of the above with a `d` field (the private exponent /
      scalar — would mean a private key was pasted by mistake)
    * `kty=oct` (a symmetric secret in `k`; HS256 keys live
      server-side in `jwt_signing_secret`, not here)
    * missing or unknown `kty`
  """
  def validate_jwk_is_public(changeset, field) do
    case get_change(changeset, field) do
      nil ->
        changeset

      jwk when is_map(jwk) ->
        case classify_jwk(jwk) do
          :ok -> changeset
          {:error, reason} -> add_error(changeset, field, reason)
        end

      _ ->
        add_error(changeset, field, "must be a JWK object")
    end
  end

  defp classify_jwk(%{"kty" => "RSA"} = jwk) do
    cond do
      Map.has_key?(jwk, "d") ->
        {:error, "looks like a private RSA key (contains 'd'); register only the public half"}

      not Map.has_key?(jwk, "n") or not Map.has_key?(jwk, "e") ->
        {:error, "RSA JWK is missing 'n' or 'e'"}

      true ->
        :ok
    end
  end

  defp classify_jwk(%{"kty" => "EC"} = jwk) do
    cond do
      Map.has_key?(jwk, "d") ->
        {:error, "looks like a private EC key (contains 'd'); register only the public half"}

      not Map.has_key?(jwk, "x") or not Map.has_key?(jwk, "y") ->
        {:error, "EC JWK is missing 'x' or 'y'"}

      true ->
        :ok
    end
  end

  defp classify_jwk(%{"kty" => "OKP"} = jwk) do
    cond do
      Map.has_key?(jwk, "d") ->
        {:error, "looks like a private OKP key (contains 'd'); register only the public half"}

      not Map.has_key?(jwk, "x") ->
        {:error, "OKP JWK is missing 'x'"}

      true ->
        :ok
    end
  end

  defp classify_jwk(%{"kty" => "oct"}) do
    {:error,
     "symmetric ('oct') keys are not supported here — HS256 secrets live server-side; register only an asymmetric public key"}
  end

  defp classify_jwk(%{"kty" => other}) do
    {:error, "unknown kty #{inspect(other)}; expected one of RSA, EC, OKP"}
  end

  defp classify_jwk(_), do: {:error, "JWK is missing 'kty'"}
end
