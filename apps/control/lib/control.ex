defmodule Control do
  @moduledoc """
  hela control plane. Owns the billing/tenant/project boundary.

    * `Control.Accounts`  — signups, sessions, Stripe customer
    * `Control.Projects`  — per-account projects, tiers, regions, JWKs
    * `Control.APIKeys`   — hk_ prefixed API keys (canonical)
    * `Control.Billing`   — Stripe subscription wiring
    * `Control.Sync`      — push canonical state out to regional gateways
  """
end
