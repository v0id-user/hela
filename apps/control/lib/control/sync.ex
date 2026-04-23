defmodule Control.Sync do
  @moduledoc """
  Push canonical project/key state to regional gateways.

  A project's data lives on one region's gateway cluster; in the
  multi-region case we push to each listed region. Every request carries
  the shared `x-hela-internal` header. Failures are surfaced — the caller
  decides whether to retry or roll the control-plane change back.
  """

  alias Control.Accounts.{Project, APIKey}
  require Logger

  def push_project(%Project{} = p) do
    regions_for(p)
    |> Enum.map(&push_project_to(p, &1))
    |> join_results()
  end

  def delete_project(%Project{} = p) do
    regions_for(p)
    |> Enum.map(fn r ->
      request(r, :delete, "/_internal/projects/#{p.id}", nil)
    end)
    |> join_results()
  end

  def push_api_key(%APIKey{} = k, region) when is_binary(region) do
    body = %{
      id: k.id,
      project_id: k.project_id,
      prefix: k.prefix,
      hashed_secret: k.hashed_secret
    }

    request(region, :post, "/_internal/api_keys", body)
  end

  def revoke_api_key(%APIKey{} = k, region) when is_binary(region) do
    request(region, :post, "/_internal/api_keys/#{k.id}/revoke", %{})
  end

  def revoke_api_key(_, nil), do: :ok

  # --- internals ------------------------------------------------------

  defp push_project_to(%Project{} = p, region) do
    body = %{
      id: p.id,
      account_id: p.account_id,
      tier: p.tier,
      region: p.region,
      jwt_public_key_jwk: p.jwt_public_key_jwk,
      jwt_signing_secret: p.jwt_signing_secret
    }

    request(region, :post, "/_internal/projects", body)
  end

  defp regions_for(%Project{multi_region: [_ | _] = more, region: home}),
    do: Enum.uniq([home | more])

  defp regions_for(%Project{region: home}), do: [home]

  defp request(region, method, path, body) do
    base =
      Application.fetch_env!(:control, :gateways)
      |> Map.get(region) || raise "unknown region #{region}"

    secret = Application.fetch_env!(:control, :internal_secret)

    opts =
      [url: base <> path, method: method, headers: [{"x-hela-internal", secret}]]
      |> Keyword.merge(if(body, do: [json: body], else: []))

    case Req.request(opts) do
      {:ok, %{status: s}} when s in 200..299 ->
        :ok

      {:ok, resp} ->
        Logger.warning("sync to #{region}#{path} failed: #{resp.status}")
        {:error, {:bad_status, resp.status}}

      {:error, reason} ->
        Logger.warning("sync to #{region}#{path} network error: #{inspect(reason)}")
        {:error, reason}
    end
  end

  defp join_results(results) do
    case Enum.filter(results, &(&1 != :ok)) do
      [] -> :ok
      errs -> {:error, errs}
    end
  end
end
