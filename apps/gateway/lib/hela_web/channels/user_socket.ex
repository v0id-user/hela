defmodule HelaWeb.UserSocket do
  @moduledoc """
  The one socket the SDK connects to. Three auth outcomes:

    * `token` — a JWT grant signed by the customer's backend (normal case)
    * `playground` — a signed-with-HS256 guest token, valid only for the
      landing-page demo project
    * no params — an anonymous socket. Can join `metrics:*` (public cluster
      metrics), but `chan:*` joins will be rejected on ProjectChannel.join
      because no project_id is assigned.
  """

  use Phoenix.Socket

  channel "chan:*", HelaWeb.ProjectChannel
  channel "metrics:*", HelaWeb.MetricsChannel

  @impl true
  def connect(params, socket, _info) do
    case authenticate(params) do
      {:ok, {pid, claims, source}} ->
        tier = Hela.Projects.tier(pid)

        if Hela.Quota.admit_connection?(pid, tier) do
          Hela.Quota.incr_connection(pid)

          {:ok,
           socket
           |> assign(:project_id, pid)
           |> assign(:claims, claims)
           |> assign(:auth_source, source)
           |> assign(:sub, claims["sub"])}
        else
          {:error, %{reason: "connection_cap_exceeded"}}
        end

      :anonymous ->
        {:ok,
         socket
         |> assign(:project_id, nil)
         |> assign(:claims, nil)
         |> assign(:auth_source, :anonymous)
         |> assign(:sub, "anon:#{:erlang.unique_integer([:positive])}")}

      :error ->
        {:error, %{reason: "unauthorized"}}
    end
  end

  @impl true
  def id(socket), do: "user_socket:#{socket.assigns.project_id || "anon"}:#{socket.assigns.sub}"

  # --- internals ---------------------------------------------------------

  # Anonymous connect is allowed. ProjectChannel.join checks project_id and
  # rejects any chan:* attempts; MetricsChannel.join works regardless.
  defp authenticate(params) when map_size(params) == 0, do: :anonymous

  defp authenticate(%{"playground" => token}) when is_binary(token) do
    case Hela.Auth.Playground.verify(token) do
      {:ok, claims} -> {:ok, {claims["pid"], claims, :playground}}
      _ -> :error
    end
  end

  defp authenticate(%{"token" => token}) when is_binary(token) do
    case Hela.Auth.JWT.verify(token, &Hela.Projects.fetch_jwk/1) do
      {:ok, claims} -> {:ok, {claims["pid"], claims, :customer}}
      _ -> :error
    end
  end

  # Anything else with params (e.g. phoenix.js' default {vsn: ...}) is anonymous.
  defp authenticate(params) do
    only_protocol_params = Enum.all?(Map.keys(params), &(&1 in ["vsn", "token", "playground"]))
    if only_protocol_params, do: :anonymous, else: :error
  end
end
