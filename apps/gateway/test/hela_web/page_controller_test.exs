# SPDX-License-Identifier: AGPL-3.0-or-later

defmodule HelaWeb.PageControllerTest do
  use ExUnit.Case, async: true
  import Phoenix.ConnTest
  import Plug.Conn

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
    assert is_binary(body["request_id"])
    assert [body["request_id"]] == get_resp_header(conn, "x-request-id")
    assert ["gateway"] == get_resp_header(conn, "x-hela-service")
    assert [body["region"]] == get_resp_header(conn, "x-hela-region")
    assert [_] = get_resp_header(conn, "x-hela-version")
  end

  test "POST /cluster/reset is not public" do
    conn = post(build_conn(), "/cluster/reset")

    assert response(conn, 404)
  end

  test "POST /_internal/cluster/reset requires internal auth" do
    conn = post(build_conn(), "/_internal/cluster/reset")

    assert %{"error" => "forbidden"} = json_response(conn, 401)
  end

  test "POST /_internal/cluster/reset accepts internal auth" do
    conn =
      build_conn()
      |> put_req_header("x-hela-internal", "dev-only-internal-secret")
      |> post("/_internal/cluster/reset")

    assert %{"ok" => true} = json_response(conn, 200)
  end
end
