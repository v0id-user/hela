defmodule ControlWeb.PageController do
  use ControlWeb, :controller

  def health(conn, _), do: json(conn, %{ok: true})

  def version(conn, _) do
    json(conn, diagnostics("control", %{node: to_string(node())}))
  end

  defp diagnostics(service, extra) do
    %{
      ok: true,
      service: service,
      version: app_version(:control),
      commit: env_first(["RAILWAY_GIT_COMMIT_SHA", "SOURCE_VERSION", "GITHUB_SHA"]),
      deployment_id: env_first(["RAILWAY_DEPLOYMENT_ID"]),
      environment: env_first(["RAILWAY_ENVIRONMENT_NAME", "RAILWAY_ENVIRONMENT"]),
      generated_at: DateTime.utc_now() |> DateTime.to_iso8601()
    }
    |> Map.merge(extra)
    |> Enum.reject(fn {_key, value} -> is_nil(value) end)
    |> Map.new()
  end

  defp app_version(app) do
    app
    |> Application.spec(:vsn)
    |> to_string()
  end

  defp env_first(names) do
    Enum.find_value(names, fn name ->
      case System.get_env(name) do
        nil -> nil
        "" -> nil
        value -> value
      end
    end)
  end
end
