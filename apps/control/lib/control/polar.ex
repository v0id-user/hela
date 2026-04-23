defmodule Control.Polar do
  @moduledoc """
  Thin HTTP client for Polar.sh. Polar's REST API is standard Bearer-auth
  JSON, so we don't need a dedicated Elixir SDK — `Req` is enough.

  Config (set via env in runtime.exs):
    * `POLAR_ACCESS_TOKEN` — organization access token (starts with `polar_oat_`)
    * `POLAR_ORG_ID`       — the organization UUID the customers live under
    * `POLAR_ENV`          — `sandbox` (default in dev) or `production`

  Product configuration is keyed by our internal tier slug. Each paid tier
  maps to a Polar Product id you've created in the dashboard.
  """

  require Logger

  @default_base "https://sandbox-api.polar.sh"
  @prod_base "https://api.polar.sh"

  # --- base + auth ----------------------------------------------------

  def base_url do
    case System.get_env("POLAR_ENV", "sandbox") do
      "production" -> @prod_base
      _ -> @default_base
    end
  end

  def token, do: System.get_env("POLAR_ACCESS_TOKEN")
  def organization_id, do: System.get_env("POLAR_ORG_ID")

  def configured?, do: is_binary(token()) and is_binary(organization_id())

  # --- customers ------------------------------------------------------

  @doc """
  Create (or reuse) a Polar customer for an account. We store the
  returned id on `accounts.polar_customer_id`.
  """
  def create_customer(%{email: email, id: external_id}) do
    if configured?() do
      post("/v1/customers", %{
        email: email,
        external_id: external_id,
        organization_id: organization_id()
      })
    else
      Logger.info("polar not configured; skipping customer create for #{email}")
      {:ok, %{"id" => nil}}
    end
  end

  # --- subscriptions / checkouts --------------------------------------

  @doc """
  Start a Polar Checkout session for a paid tier. Returns a URL the
  customer redirects to. On completion Polar redirects back to
  `success_url` and fires a webhook.
  """
  def create_checkout(project, product_id, success_url) do
    if configured?() do
      post("/v1/checkouts", %{
        product_id: product_id,
        customer_external_id: project.account_id,
        metadata: %{project_id: project.id, tier: project.tier},
        success_url: success_url
      })
    else
      Logger.info("polar not configured; skipping checkout for #{project.id}")
      {:ok, %{"url" => nil}}
    end
  end

  @doc "Cancel a Polar subscription at period end + prorate."
  def cancel_subscription(subscription_id) when is_binary(subscription_id) do
    if configured?() do
      patch("/v1/subscriptions/#{subscription_id}", %{
        cancel_at_period_end: true
      })
    else
      {:ok, %{}}
    end
  end

  def cancel_subscription(nil), do: {:ok, %{}}

  # --- webhook signature ----------------------------------------------

  @doc """
  Verify a Polar webhook. Polar uses the standard `webhook-id`,
  `webhook-timestamp`, `webhook-signature` headers with HMAC-SHA256
  (same scheme as Svix).

  `secret` is `POLAR_WEBHOOK_SECRET`, set per endpoint in the Polar
  dashboard. Returns `{:ok, decoded_payload}` or `{:error, reason}`.
  """
  def verify_webhook(raw_body, headers, secret) when is_binary(raw_body) do
    with id when is_binary(id) <- header(headers, "webhook-id"),
         ts when is_binary(ts) <- header(headers, "webhook-timestamp"),
         sig when is_binary(sig) <- header(headers, "webhook-signature"),
         :ok <- check_timestamp(ts),
         :ok <- check_signature(id, ts, raw_body, sig, secret),
         {:ok, decoded} <- Jason.decode(raw_body) do
      {:ok, decoded}
    else
      err -> {:error, err}
    end
  end

  # --- internals ------------------------------------------------------

  defp post(path, body), do: req(:post, path, body)
  defp patch(path, body), do: req(:patch, path, body)

  defp req(method, path, body) do
    opts = [
      method: method,
      url: base_url() <> path,
      headers: [
        {"authorization", "Bearer #{token()}"},
        {"content-type", "application/json"}
      ],
      json: body
    ]

    case Req.request(opts) do
      {:ok, %{status: s, body: b}} when s in 200..299 ->
        {:ok, b}

      {:ok, resp} ->
        Logger.warning("polar #{method} #{path} failed: #{resp.status} #{inspect(resp.body)}")
        {:error, {:bad_status, resp.status, resp.body}}

      {:error, reason} ->
        Logger.warning("polar #{method} #{path} network error: #{inspect(reason)}")
        {:error, reason}
    end
  end

  defp header(headers, name) do
    Enum.find_value(headers, fn
      {^name, v} -> v
      {k, v} when is_binary(k) -> if String.downcase(k) == name, do: v
      _ -> nil
    end)
  end

  # Reject events more than 5 minutes old to kill replay attacks.
  defp check_timestamp(ts) do
    with {n, _} <- Integer.parse(ts),
         true <- abs(System.system_time(:second) - n) < 300 do
      :ok
    else
      _ -> :stale
    end
  end

  defp check_signature(id, ts, body, header, secret) do
    # Header shape (Svix-style): `v1,<base64sig> v1,<base64sig> ...`
    # Any matching signature is acceptable. We compute the expected
    # signature over `id.ts.body` with HMAC-SHA256.
    signed = "#{id}.#{ts}.#{body}"
    secret_bytes = decode_secret(secret)
    expected = :crypto.mac(:hmac, :sha256, secret_bytes, signed) |> Base.encode64()

    header
    |> String.split(" ", trim: true)
    |> Enum.any?(fn tag ->
      case String.split(tag, ",", parts: 2) do
        [_v, sig] -> Plug.Crypto.secure_compare(sig, expected)
        _ -> false
      end
    end)
    |> case do
      true -> :ok
      false -> :bad_signature
    end
  end

  # `whsec_BASE64SECRET` → raw bytes
  defp decode_secret("whsec_" <> rest),
    do: Base.decode64!(rest, padding: false)

  defp decode_secret(s), do: s
end
