# SPDX-License-Identifier: AGPL-3.0-or-later

defmodule Control.Accounts.AccountTest do
  use ExUnit.Case, async: true

  alias Control.Accounts.Account

  describe "signup_changeset/1" do
    test "accepts a valid email + password" do
      cs = Account.signup_changeset(%{email: "alice@example.com", password: "hunter22!"})

      assert cs.valid?
      assert is_binary(get_field(cs, :password_hash))
      refute get_change(cs, :password)
    end

    test "rejects a missing password" do
      cs = Account.signup_changeset(%{email: "alice@example.com"})

      refute cs.valid?
      assert {"can't be blank", _} = cs.errors[:password]
    end

    test "rejects a short password" do
      cs = Account.signup_changeset(%{email: "alice@example.com", password: "short"})

      refute cs.valid?
      assert {_, [{:count, 8} | _]} = cs.errors[:password]
    end

    test "rejects an empty-string password" do
      cs = Account.signup_changeset(%{email: "alice@example.com", password: ""})

      refute cs.valid?
      assert {"can't be blank", _} = cs.errors[:password]
    end

    test "rejects an invalid email" do
      cs = Account.signup_changeset(%{email: "not-an-email", password: "hunter22!"})

      refute cs.valid?
      assert {"has invalid format", _} = cs.errors[:email]
    end
  end

  describe "verify_password/2" do
    setup do
      cs = Account.signup_changeset(%{email: "bob@example.com", password: "correctbattery"})
      account = Ecto.Changeset.apply_changes(cs)
      {:ok, account: account}
    end

    test "returns :ok for the correct password", %{account: account} do
      assert :ok = Account.verify_password(account, "correctbattery")
    end

    test "returns :error for a wrong password", %{account: account} do
      assert :error = Account.verify_password(account, "horse-staple")
    end

    test "returns :error and runs a dummy hash when account has no password_hash" do
      assert :error = Account.verify_password(%Account{password_hash: nil}, "anything")
    end
  end

  defp get_field(changeset, field), do: Ecto.Changeset.get_field(changeset, field)
  defp get_change(changeset, field), do: Ecto.Changeset.get_change(changeset, field)
end
