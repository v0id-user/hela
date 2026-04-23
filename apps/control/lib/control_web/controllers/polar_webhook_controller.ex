defmodule ControlWeb.PolarWebhookController do
  @moduledoc """
  Verifies a Polar webhook's HMAC signature against `POLAR_WEBHOOK_SECRET`
  and dispatches to `Control.Billing.handle_webhook/1`.

  In dev with no secret configured we accept + decode unverified so the
  Polar CLI's sandbox webhook forwarder works without extra setup.
  """

  use ControlWeb, :controller

  alias Control.{Polar, Billing}

  def handle(conn, _) do
    raw = conn.assigns[:raw_body] || ""

    event =
      case System.get_env("POLAR_WEBHOOK_SECRET") do
        nil -> Jason.decode(raw) |> decode_result()
        "" -> Jason.decode(raw) |> decode_result()
        secret -> Polar.verify_webhook(raw, conn.req_headers, secret)
      end

    case event do
      {:ok, payload} ->
        Billing.handle_webhook(payload)
        json(conn, %{received: true})

      {:error, reason} ->
        conn |> put_status(400) |> json(%{error: inspect(reason)})
    end
  end

  defp decode_result({:ok, v}), do: {:ok, v}
  defp decode_result({:error, _} = e), do: e
  defp decode_result(other), do: {:error, other}
end
