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

  Note: Polar's API rejects `organization_id` in the body when the
  request is authed with an organization token (the token itself scopes
  the call). So we just send email + external_id.
  """
  def create_customer(%{email: email, id: external_id}) do
    if configured?() do
      post("/v1/customers", %{email: email, external_id: external_id})
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

  @doc """
  Aggregate state for a single customer:
    `active_subscriptions`, `granted_benefits`, `active_meters`, etc.
  Returns `{:ok, %{}}` if Polar isn't configured (dev with no
  `POLAR_ACCESS_TOKEN`) so the dashboard renders an empty state
  instead of erroring.
  """
  def get_customer_state(nil), do: {:ok, %{}}

  def get_customer_state(customer_id) when is_binary(customer_id) do
    if configured?() do
      get("/v1/customers/#{customer_id}/state")
    else
      {:ok, %{}}
    end
  end

  @doc """
  Delete a customer (used on account delete). Polar cascades: any
  subscriptions for that customer get canceled implicitly. We
  still call `cancel_subscription/1` per project before deleting
  the customer so the cancellation reasons + period-end behavior
  match the per-project flow.

  Returns `{:ok, %{}}` if Polar isn't configured or the customer id
  is nil — account-delete must succeed locally even if Polar is
  flaky or unconfigured.
  """
  def delete_customer(nil), do: {:ok, %{}}

  def delete_customer(customer_id) when is_binary(customer_id) do
    if configured?() do
      case delete("/v1/customers/#{customer_id}") do
        {:ok, body} -> {:ok, body}
        {:error, _} = err -> err
      end
    else
      {:ok, %{}}
    end
  end

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
  defp get(path), do: req(:get, path, nil)
  defp delete(path), do: req(:delete, path, nil)

  defp req(method, path, body) do
    opts =
      [
        method: method,
        url: base_url() <> path,
        headers: [
          {"authorization", "Bearer #{token()}"},
          {"content-type", "application/json"}
        ]
      ]
      |> then(fn o -> if body == nil, do: o, else: Keyword.put(o, :json, body) end)

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
