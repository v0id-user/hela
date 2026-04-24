defmodule Hela.Auth.Playground do
  @moduledoc """
  The public landing-page playground issues short-lived HS256 tokens bound
  to a single well-known project id. Everything in this project is sandboxed:
  it shares no data with real customers, and its quotas are capped aggressively
  to keep the demo cheap.
  """

  def config, do: Application.fetch_env!(:hela, :playground)

  def project_id, do: Keyword.fetch!(config(), :project_id)

  def issue_guest_token(opts \\ []) do
    cfg = config()
    ephemeral = opts[:ephemeral] == true

    claims = %{
      "pid" => Keyword.fetch!(cfg, :project_id),
      "sub" => opts[:sub] || "guest:#{:erlang.unique_integer([:positive, :monotonic])}",
      "ephemeral" => ephemeral,
      "chans" => [
        ["read", "hello:**"],
        ["write", "hello:**"],
        ["read", "demo:**"],
        ["write", "demo:**"]
      ]
    }

    Hela.Auth.JWT.sign(claims, Keyword.fetch!(cfg, :secret), Keyword.fetch!(cfg, :ttl_seconds))
  end

  def verify(token) do
    cfg = config()
    Hela.Auth.JWT.verify_hs256(token, Keyword.fetch!(cfg, :secret))
  end

  def playground_project?(pid), do: pid == project_id()
end
