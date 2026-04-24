# SPDX-License-Identifier: AGPL-3.0-or-later

defmodule HelaWeb.PageControllerTest do
  use ExUnit.Case, async: true
  import Phoenix.ConnTest

  @endpoint HelaWeb.Endpoint

  test "GET /health returns ok" do
    conn = get(build_conn(), "/health")

    assert %{"ok" => true} = json_response(conn, 200)
  end

  test "GET /version returns gateway diagnostics" do
    conn = get(build_conn(), "/version")
    body = json_response(conn, 200)

    assert body["ok"] == true
    assert body["service"] == "gateway"
    assert is_binary(body["version"])
    assert is_binary(body["generated_at"])
    assert is_binary(body["region"])
    assert is_binary(body["node"])
  end
end
