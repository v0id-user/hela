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
end
