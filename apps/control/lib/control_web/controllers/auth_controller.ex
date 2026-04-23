defmodule ControlWeb.AuthController do
  use ControlWeb, :controller

  alias Control.Accounts

  def signup(conn, %{"email" => email}) do
    case Accounts.create_account(email) do
      {:ok, account} ->
        conn
        |> put_session(:account_id, account.id)
        |> json(%{account: shape(account)})

      {:error, changeset} ->
        conn
        |> put_status(400)
        |> json(%{error: "invalid", details: errors(changeset)})
    end
  end

  # Password login is scaffolded; real impl would check Bcrypt.verify_pass.
  # For v1 the dashboard issues a session by email lookup in dev mode.
  def login(conn, %{"email" => email}) do
    case Accounts.get_account_by_email(email) do
      nil ->
        conn |> put_status(401) |> json(%{error: "no_such_account"})

      account ->
        conn
        |> put_session(:account_id, account.id)
        |> json(%{account: shape(account)})
    end
  end

  def logout(conn, _) do
    conn |> configure_session(drop: true) |> json(%{ok: true})
  end

  def me(conn, _), do: json(conn, %{account: shape(conn.assigns.account)})

  defp shape(a), do: Map.take(a, [:id, :email, :polar_customer_id, :github_id])

  defp errors(%Ecto.Changeset{errors: errs}),
    do: Enum.into(errs, %{}, fn {k, {m, _}} -> {k, m} end)
end
