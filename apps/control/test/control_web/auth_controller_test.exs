# SPDX-License-Identifier: AGPL-3.0-or-later

defmodule ControlWeb.AuthControllerTest do
  use ExUnit.Case, async: false
  import Phoenix.ConnTest
  import Plug.Conn

  alias Control.Repo

  @endpoint ControlWeb.Endpoint

  setup do
    :ok = Ecto.Adapters.SQL.Sandbox.checkout(Repo)
  end

  test "csrf token endpoint supports unsafe auth requests" do
    conn = get(build_conn(), "/auth/csrf")
    token = json_response(conn, 200)["csrf_token"]

    conn =
      conn
      |> recycle()
      |> put_req_header("x-csrf-token", token)
      |> post("/auth/signup", %{email: "csrf-ok@example.com", password: "hunter22!"})

    assert %{"account" => %{"email" => "csrf-ok@example.com"}} = json_response(conn, 200)
  end
end
