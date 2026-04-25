defmodule Control.Billing do
  @moduledoc """
  Billing facade over `Control.Polar`.

    * `ensure_customer/1` — create a Polar customer the first time we
      see an account
    * `start_checkout/2`  — return a checkout URL for a paid-tier project
    * `cancel_subscription/1` — project delete → cancel its Polar sub
    * `handle_webhook/1`  — dispatch verified webhook events

  All functions are no-ops for Free-tier projects and in environments
  where `POLAR_ACCESS_TOKEN` is unset (local dev without Polar keys).
  """

  alias Control.Accounts.{Account, Project}
  alias Control.{Repo, Polar}
  require Logger

  # Tier → Polar product id. Populate via POLAR_PRODUCT_* env vars at
  # deploy time; falls back to nil (no-op) in dev.
  defp product_ids do
    %{
      "starter" => System.get_env("POLAR_PRODUCT_STARTER"),
      "growth" => System.get_env("POLAR_PRODUCT_GROWTH"),
      "scale" => System.get_env("POLAR_PRODUCT_SCALE")
    }
  end

  def ensure_customer(%Account{polar_customer_id: id} = a) when is_binary(id), do: {:ok, a}

  def ensure_customer(%Account{} = a) do
    case Polar.create_customer(%{email: a.email, id: a.id}) do
      {:ok, %{"id" => pid}} when is_binary(pid) ->
        a |> Ecto.Changeset.change(polar_customer_id: pid) |> Repo.update()

      _ ->
        # Polar unavailable or misconfigured — signup still succeeds.
        {:ok, a}
    end
  end

  # Called from Accounts.create_project. For free projects we do nothing;
  # paid ones get a checkout URL the frontend should redirect the user to.
  def attach_subscription_item(%Project{tier: "free"} = p), do: {:ok, p}

  def attach_subscription_item(%Project{} = p), do: {:ok, p}

  @doc """
  Start a Polar Checkout for this project's tier. Returns
  `{:ok, url}` on success, `{:ok, nil}` if Polar is unconfigured.
  """
  def start_checkout(%Project{tier: "free"}, _), do: {:ok, nil}

  def start_checkout(%Project{} = p, success_url) do
    case Map.get(product_ids(), p.tier) do
      nil ->
        Logger.info("no polar product id for tier #{p.tier}; skipping checkout")
        {:ok, nil}

      product_id ->
        case Polar.create_checkout(p, product_id, success_url) do
          {:ok, %{"url" => url}} -> {:ok, url}
          _ -> {:ok, nil}
        end
    end
  end

  def cancel_subscription_item(%Project{polar_subscription_id: nil}), do: :ok

  def cancel_subscription_item(%Project{polar_subscription_id: sid}) do
    Polar.cancel_subscription(sid)
    :ok
  end

  # --- billing summary (for the dashboard's Billing page) -------------

  @doc """
  Aggregate billing snapshot for an account. Used by `GET /api/billing`
  to populate the dashboard. Pulls Polar's customer state once and
  joins it against the local project rows.

  Returns `subscriptions: []` and `has_payment_method: false` if Polar
  isn't configured (dev with no `POLAR_ACCESS_TOKEN`).

  `subscription_summary` keeps only the fields the UI uses, so we
  don't leak Polar's internal shape (or PII like billing addresses)
  into our API response.
  """
  def summary(%Account{} = account) do
    projects =
      account.id
      |> Control.Accounts.list_projects()
      |> Enum.map(&shape_project/1)

    state =
      case Polar.get_customer_state(account.polar_customer_id) do
        {:ok, body} when is_map(body) -> body
        _ -> %{}
      end

    subs = state |> Map.get("active_subscriptions", []) |> Enum.map(&shape_subscription/1)

    %{
      account: %{
        id: account.id,
        email: account.email,
        polar_customer_id: account.polar_customer_id
      },
      projects: projects,
      subscriptions: subs,
      has_payment_method: state |> Map.get("default_payment_method") |> is_map()
    }
  end

  defp shape_project(p) do
    %{
      id: p.id,
      name: p.name,
      tier: p.tier,
      polar_subscription_id: p.polar_subscription_id
    }
  end

  defp shape_subscription(s) when is_map(s) do
    price = s |> Map.get("prices", []) |> List.first() || %{}

    %{
      id: s["id"],
      status: s["status"],
      current_period_end: s["current_period_end"],
      recurring_interval: s["recurring_interval"],
      amount: price["price_amount"],
      currency: price["price_currency"],
      product_id: s["product_id"]
    }
  end

  # --- account delete (full teardown) ---------------------------------

  @doc """
  Delete the Polar customer for this account. Used by
  `Accounts.delete_account/1` after per-project subs are canceled.
  No-op if the account has no `polar_customer_id` or Polar isn't
  configured. Errors are logged but never raised — local account
  deletion proceeds even if Polar is flaky, since the alternative
  is leaving the user unable to delete.
  """
  def delete_customer(%Account{polar_customer_id: nil}), do: :ok

  def delete_customer(%Account{polar_customer_id: cid}) do
    case Polar.delete_customer(cid) do
      {:ok, _} ->
        :ok

      {:error, reason} ->
        Logger.warning("polar customer delete failed for #{cid}: #{inspect(reason)}")
        :ok
    end
  end

  # --- webhook dispatch -----------------------------------------------

  def handle_webhook(%{"type" => "subscription.created", "data" => data}) do
    attach_subscription_to_project(data)
  end

  def handle_webhook(%{"type" => "subscription.updated", "data" => data}) do
    attach_subscription_to_project(data)
  end

  def handle_webhook(%{"type" => "subscription.canceled", "data" => %{"id" => sid}}) do
    Logger.info("polar sub canceled: #{sid}")
    :ok
  end

  def handle_webhook(%{"type" => "order.paid"}), do: :ok

  def handle_webhook(%{"type" => t}) do
    Logger.debug("polar webhook ignored: #{t}")
    :ok
  end

  def handle_webhook(_), do: :ok

  # Polar's subscription payload carries metadata we set at checkout
  # time. Thread back to the project row and stash the subscription id.
  defp attach_subscription_to_project(%{"id" => sid, "metadata" => %{"project_id" => pid}}) do
    case Repo.get(Project, pid) do
      nil ->
        :ok

      project ->
        project
        |> Ecto.Changeset.change(polar_subscription_id: sid)
        |> Repo.update()

        :ok
    end
  end

  defp attach_subscription_to_project(_), do: :ok
end
