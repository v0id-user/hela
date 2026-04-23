defmodule ControlWeb.Plugs.RequireAccount do
  @moduledoc """
  Read the session cookie's account_id and load the Account onto the
  conn. Bounces unauthenticated requests with a 401 so clients redirect
  to the signup flow.
  """
  import Plug.Conn

  def init(opts), do: opts

  def call(conn, _opts) do
    account_id = get_session(conn, :account_id)

    with id when is_binary(id) <- account_id,
         account when not is_nil(account) <- Control.Accounts.get_account(id) do
      assign(conn, :account, account)
    else
      _ ->
        conn
        |> put_resp_content_type("application/json")
        |> send_resp(401, Jason.encode!(%{error: "unauthenticated"}))
        |> halt()
    end
  end
end
