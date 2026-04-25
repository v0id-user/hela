defmodule ControlWeb.BillingController do
  @moduledoc """
  GET /api/billing — billing summary for the signed-in account.
  Joins the account's projects against Polar's customer state so
  the dashboard renders real subscription state, not a fabricated
  payment-method placeholder.
  """
  use ControlWeb, :controller

  alias Control.Billing

  def show(conn, _params) do
    account = conn.assigns.account
    json(conn, Billing.summary(account))
  end
end
