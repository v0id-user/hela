defmodule Control.Accounts.ProjectTest do
  use ExUnit.Case, async: true

  alias Control.Accounts.Project

  describe "create_changeset/1" do
    test "accepts valid attrs" do
      cs =
        Project.create_changeset(%{
          account_id: "acc_test",
          name: "testapp",
          region: "iad",
          tier: "starter"
        })

      assert cs.valid?
    end

    test "rejects an invalid region" do
      cs =
        Project.create_changeset(%{
          account_id: "acc_test",
          name: "x",
          region: "nowhere",
          tier: "free"
        })

      refute cs.valid?
      assert {"is invalid", _} = cs.errors[:region]
    end

    test "rejects an invalid tier" do
      cs =
        Project.create_changeset(%{
          account_id: "acc_test",
          name: "x",
          region: "iad",
          tier: "platinum"
        })

      refute cs.valid?
    end

    test "auto-generates a signing secret" do
      cs =
        Project.create_changeset(%{
          account_id: "acc_test",
          name: "x",
          region: "iad"
        })

      secret = Ecto.Changeset.get_change(cs, :jwt_signing_secret)
      assert is_binary(secret)
      # 32 random bytes → 64 hex chars
      assert byte_size(secret) == 64
    end

    test "each project's signing secret is unique" do
      secrets =
        for _ <- 1..20 do
          cs = Project.create_changeset(%{account_id: "a", name: "x", region: "iad"})
          Ecto.Changeset.get_change(cs, :jwt_signing_secret)
        end

      assert length(Enum.uniq(secrets)) == 20
    end
  end

  describe "new_signing_secret/0" do
    test "is 64 lowercase hex chars" do
      secret = Project.new_signing_secret()
      assert Regex.match?(~r/^[0-9a-f]{64}$/, secret)
    end
  end

  describe "rotate_secret_changeset/1" do
    test "produces a new secret different from the old" do
      project = %Project{
        id: "proj_test",
        account_id: "acc_test",
        name: "x",
        region: "iad",
        tier: "free",
        jwt_signing_secret: Project.new_signing_secret()
      }

      cs = Project.rotate_secret_changeset(project)
      new_secret = Ecto.Changeset.get_change(cs, :jwt_signing_secret)

      assert new_secret != project.jwt_signing_secret
      assert Regex.match?(~r/^[0-9a-f]{64}$/, new_secret)
    end
  end

  describe "update_changeset/2 with jwt_public_key_jwk" do
    setup do
      project = %Project{
        id: "proj_test",
        account_id: "acc_test",
        name: "x",
        region: "iad",
        tier: "free",
        jwt_signing_secret: Project.new_signing_secret()
      }

      {:ok, project: project}
    end

    test "accepts a valid public RSA JWK", %{project: project} do
      jwk = %{
        "kty" => "RSA",
        "n" =>
          "0vx7agoebGcQSuuPiLJXZptN9nndrQmbXEps2aiAFbWhM78LhWx4cbbfAAtVT86zwu1RK7aPFFxuhDR1L6tSoc_BJECPebWKRXjBZCiFV4n3oknjhMstn64tZ_2W-5JsGY4Hc5n9yBXArwl93lqt7_RN5w6Cf0h4QyQ5v-65YGjQR0_FDW2QvzqY368QQMicAtaSqzs8KJZgnYb9c7d0zgdAZHzu6qMQvRL5hajrn1n91CbOpbISD08qNLyrdkt-bFTWhAI4vMQFh6WeZu0fM4lFd2NcRwr3XPksINHaQ-G_xBniIqbw0Ls1jF44-csFCur-kEgU8awapJzKnqDKgw",
        "e" => "AQAB",
        "alg" => "RS256",
        "kid" => "main"
      }

      cs = Project.update_changeset(project, %{jwt_public_key_jwk: jwk})
      assert cs.valid?, "expected valid, got errors: #{inspect(cs.errors)}"
    end

    test "accepts a valid public EC JWK", %{project: project} do
      jwk = %{
        "kty" => "EC",
        "crv" => "P-256",
        "x" => "MKBCTNIcKUSDii11ySs3526iDZ8AiTo7Tu6KPAqv7D4",
        "y" => "4Etl6SRW2YiLUrN5vfvVHuhp7x8PxltmWWlbbM4IFyM",
        "alg" => "ES256",
        "kid" => "ec-1"
      }

      cs = Project.update_changeset(project, %{jwt_public_key_jwk: jwk})
      assert cs.valid?, "expected valid, got errors: #{inspect(cs.errors)}"
    end

    test "accepts a valid OKP (Ed25519) public JWK", %{project: project} do
      jwk = %{
        "kty" => "OKP",
        "crv" => "Ed25519",
        "x" => "11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo",
        "kid" => "ed-1"
      }

      cs = Project.update_changeset(project, %{jwt_public_key_jwk: jwk})
      assert cs.valid?, "expected valid, got errors: #{inspect(cs.errors)}"
    end

    test "rejects a private RSA JWK (contains 'd')", %{project: project} do
      jwk = %{
        "kty" => "RSA",
        "n" => "0vx7ago...",
        "e" => "AQAB",
        "d" => "X4cTteJY_gE589i-XXXXX_PRIVATE_KEY_DO_NOT_PASTE"
      }

      cs = Project.update_changeset(project, %{jwt_public_key_jwk: jwk})
      refute cs.valid?
      {msg, _} = cs.errors[:jwt_public_key_jwk]
      assert msg =~ "private RSA"
    end

    test "rejects a private EC JWK (contains 'd')", %{project: project} do
      jwk = %{
        "kty" => "EC",
        "crv" => "P-256",
        "x" => "MKBCTNIcKUSDii11ySs3526iDZ8AiTo7Tu6KPAqv7D4",
        "y" => "4Etl6SRW2YiLUrN5vfvVHuhp7x8PxltmWWlbbM4IFyM",
        "d" => "870MB6gfuTJ4HtUnUvYMyJpr5eUZNP4Bk43bVdj3eAE"
      }

      cs = Project.update_changeset(project, %{jwt_public_key_jwk: jwk})
      refute cs.valid?
      {msg, _} = cs.errors[:jwt_public_key_jwk]
      assert msg =~ "private EC"
    end

    test "rejects a private OKP JWK (contains 'd')", %{project: project} do
      jwk = %{
        "kty" => "OKP",
        "crv" => "Ed25519",
        "x" => "11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo",
        "d" => "nWGxne_9WmC6hEr0kuwsxERJxWl7MmkZcDusAxyuf2A"
      }

      cs = Project.update_changeset(project, %{jwt_public_key_jwk: jwk})
      refute cs.valid?
      {msg, _} = cs.errors[:jwt_public_key_jwk]
      assert msg =~ "private OKP"
    end

    test "rejects a symmetric (oct) JWK", %{project: project} do
      jwk = %{
        "kty" => "oct",
        "k" => "GawgguFyGrWKav7AX4VKUg",
        "alg" => "HS256"
      }

      cs = Project.update_changeset(project, %{jwt_public_key_jwk: jwk})
      refute cs.valid?
      {msg, _} = cs.errors[:jwt_public_key_jwk]
      assert msg =~ "symmetric"
    end

    test "rejects a JWK with no kty", %{project: project} do
      jwk = %{"n" => "abc", "e" => "AQAB"}

      cs = Project.update_changeset(project, %{jwt_public_key_jwk: jwk})
      refute cs.valid?
      {msg, _} = cs.errors[:jwt_public_key_jwk]
      assert msg =~ "missing 'kty'"
    end

    test "rejects an unknown kty", %{project: project} do
      jwk = %{"kty" => "FOO", "x" => "abc"}

      cs = Project.update_changeset(project, %{jwt_public_key_jwk: jwk})
      refute cs.valid?
      {msg, _} = cs.errors[:jwt_public_key_jwk]
      assert msg =~ "unknown kty"
    end

    test "rejects an RSA JWK missing n/e", %{project: project} do
      jwk = %{"kty" => "RSA", "alg" => "RS256"}

      cs = Project.update_changeset(project, %{jwt_public_key_jwk: jwk})
      refute cs.valid?
      {msg, _} = cs.errors[:jwt_public_key_jwk]
      assert msg =~ "missing 'n' or 'e'"
    end

    test "lets unrelated updates through without touching the JWK", %{project: project} do
      cs = Project.update_changeset(project, %{name: "renamed"})
      assert cs.valid?
      assert Ecto.Changeset.get_change(cs, :name) == "renamed"
      assert Ecto.Changeset.get_change(cs, :jwt_public_key_jwk) == nil
    end
  end
end
