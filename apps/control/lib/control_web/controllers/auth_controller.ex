defmodule ControlWeb.AuthController do
  use ControlWeb, :controller

  alias Control.Accounts

  def signup(conn, %{"email" => email, "password" => password})
      when is_binary(email) and is_binary(password) do
    case Accounts.create_account(email, password) do
      {:ok, account} ->
        conn
        |> put_session(:account_id, account.id)
        |> configure_session(renew: true)
        |> json(%{account: shape(account)})

      {:error, changeset} ->
        conn
        |> put_status(400)
        |> json(%{error: "invalid", details: errors(changeset)})
    end
  end

  def signup(conn, _) do
    conn |> put_status(400) |> json(%{error: "email_and_password_required"})
  end

  def login(conn, %{"email" => email, "password" => password})
      when is_binary(email) and is_binary(password) do
    case Accounts.authenticate(email, password) do
      {:ok, account} ->
        conn
        |> put_session(:account_id, account.id)
        |> configure_session(renew: true)
        |> json(%{account: shape(account)})

      {:error, :unauthorized} ->
        conn |> put_status(401) |> json(%{error: "invalid_credentials"})
    end
  end

  def login(conn, _) do
    conn |> put_status(400) |> json(%{error: "email_and_password_required"})
  end

  def logout(conn, _) do
    conn |> configure_session(drop: true) |> json(%{ok: true})
  end

  def me(conn, _), do: json(conn, %{account: shape(conn.assigns.account)})

  @doc """
  Account self-delete. Cancels paid Polar subscriptions, removes
  projects (cascading keys + gateway sync), deletes the Polar
  customer, and deletes the account row. Drops the session at the
  end so the dashboard's bootstrap call returns 401 on next load.
  """
  def delete_me(conn, _) do
    :ok = Accounts.delete_account(conn.assigns.account)

    conn
    |> configure_session(drop: true)
    |> json(%{ok: true})
  end

  defp shape(a), do: Map.take(a, [:id, :email, :polar_customer_id, :github_id])

  defp errors(%Ecto.Changeset{errors: errs}),
    do: Enum.into(errs, %{}, fn {k, {m, _}} -> {k, m} end)
end
