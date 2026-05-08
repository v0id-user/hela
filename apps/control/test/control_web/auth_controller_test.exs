# SPDX-License-Identifier: AGPL-3.0-or-later

defmodule ControlWeb.AuthControllerTest do
  use ExUnit.Case, async: false
  import Phoenix.ConnTest
  import Plug.Conn

  alias Control.Repo

  @endpoint ControlWeb.Endpoint

  setup do
    :ok = Ecto.Adapters.SQL.Sandbox.checkout(Repo)
    Control.AuthLimiter.reset()
  end

  test "csrf token endpoint supports unsafe auth requests" do
    conn = get(build_conn(), "/auth/csrf")
    token = json_response(conn, 200)["csrf_token"]

    assert [_] = get_resp_header(conn, "set-cookie")

    conn =
      conn
      |> recycle()
      |> put_req_header("x-csrf-token", token)
      |> post("/auth/signup", %{email: "csrf-ok@example.com", password: "hunter22!"})

    assert %{"account" => %{"email" => "csrf-ok@example.com"}} = json_response(conn, 200)
  end

  test "signup can be invite-only" do
    previous_mode = System.get_env("HELA_SIGNUP_MODE")
    previous_codes = System.get_env("HELA_INVITE_CODES")

    System.put_env("HELA_SIGNUP_MODE", "invite")
    System.put_env("HELA_INVITE_CODES", "alpha,beta")

    on_exit(fn ->
      restore_env("HELA_SIGNUP_MODE", previous_mode)
      restore_env("HELA_INVITE_CODES", previous_codes)
    end)

    token = csrf_token()

    blocked =
      build_conn()
      |> put_req_header("x-csrf-token", token)
      |> post("/auth/signup", %{email: "invite-blocked@example.com", password: "hunter22!"})

    assert %{"error" => "invite_required"} = json_response(blocked, 403)

    allowed =
      build_conn()
      |> put_req_header("x-csrf-token", csrf_token())
      |> post("/auth/signup", %{
        email: "invite-ok@example.com",
        password: "hunter22!",
        invite_code: "alpha"
      })

    assert %{"account" => %{"email" => "invite-ok@example.com"}} = json_response(allowed, 200)
  end

  test "signup is rate limited per ip" do
    for n <- 1..5 do
      conn =
        build_conn()
        |> put_req_header("x-csrf-token", csrf_token())
        |> post("/auth/signup", %{email: "rl-#{n}@example.com", password: "hunter22!"})

      assert %{"account" => _} = json_response(conn, 200)
    end

    denied =
      build_conn()
      |> put_req_header("x-csrf-token", csrf_token())
      |> post("/auth/signup", %{email: "rl-denied@example.com", password: "hunter22!"})

    assert %{"error" => "rate_limited", "scope" => "auth"} = json_response(denied, 429)
  end

  defp csrf_token do
    build_conn()
    |> get("/auth/csrf")
    |> json_response(200)
    |> Map.fetch!("csrf_token")
  end

  defp restore_env(name, nil), do: System.delete_env(name)
  defp restore_env(name, value), do: System.put_env(name, value)
end
