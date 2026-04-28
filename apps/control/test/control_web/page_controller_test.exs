# SPDX-License-Identifier: AGPL-3.0-or-later

defmodule ControlWeb.PageControllerTest do
  use ExUnit.Case, async: true
  import Phoenix.ConnTest
  import Plug.Conn

  @endpoint ControlWeb.Endpoint

  test "GET /health returns ok" do
    conn = get(build_conn(), "/health")

    assert %{"ok" => true} = json_response(conn, 200)
  end

  test "GET /version returns control diagnostics" do
    conn = get(build_conn(), "/version")
    body = json_response(conn, 200)

    assert body["ok"] == true
    assert body["service"] == "control"
    assert is_binary(body["version"])
    assert is_binary(body["generated_at"])
    assert is_binary(body["node"])
    assert is_binary(body["request_id"])
    assert [body["request_id"]] == get_resp_header(conn, "x-request-id")
    assert ["control"] == get_resp_header(conn, "x-hela-service")
    assert [_] = get_resp_header(conn, "x-hela-version")
  end
end
