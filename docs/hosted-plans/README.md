# hosted plans

This directory is the **single source of truth** for the hosted-product
plan catalog: names, prices, caps, descriptions, and the Polar product
mapping. Anything user-facing that mentions a plan (the marketing site,
the in-app project picker, the README pricing table, the Polar catalog
itself, SDK docs) should match what is written here. If you find a
mismatch, this directory wins and the other surface is the bug.

This is a **hosted-product** concern. If you are self hosting, you set
your own caps in your own deploy and none of these prices apply — see
[`../index.md`](../index.md) for the OSS-vs-hosted split.

## Plans

One file per tier. Each file gives the canonical one-line description
(the same string we publish to Polar), the full caps table, and the
Polar wiring.

| slug | tier | $/mo | one-line description |
| --- | --- | --- | --- |
| [`free`](./free.md) | Free | $0 | 100 connections · 1M messages/mo · single region |
| [`starter`](./starter.md) | Starter | $19 | 1000 connections · 10M messages/mo |
| [`growth`](./growth.md) | Growth | $99 | 10k connections · 100M messages/mo · 99.9% SLA |
| [`scale`](./scale.md) | Scale | $499 | 100k connections · 1B messages/mo · multi-region · 99.95% SLA |
| [`enterprise`](./enterprise.md) | Enterprise | contact | custom limits · all regions · 99.99% SLA |

The slug is the URL-safe identifier the rest of the codebase uses
(`?plan=<slug>` on signup, `Tier` enum in `packages/sdk-types`, etc).

## Cross-cutting policy

These rules apply to every paid tier and are not duplicated in the
per-plan files.

- **Currency.** USD. No other billing currency today.
- **Cadence.** Monthly recurring. Annual = 2 months free is a sales
  motion, not a separate Polar product.
- **Connection cap.** Hard. The gateway refuses joins past the cap.
- **Message cap.** Soft. Messages above the tier cap are billed as
  overage at **$0.50 per million** in the next invoice cycle. There is
  no per-message metering on the publish path itself; usage is rolled
  up daily by the control plane.
- **Publish rate.** Per-channel token bucket. Bursts up to 2× the
  steady rate are tolerated; sustained excess is dropped with a
  `rate_limited` error event on the channel.
- **History retention.** "Last N messages" per channel, evicted FIFO.
  Not a time window.
- **SLA.** Measured on the gateway WebSocket endpoint, calendar-month
  uptime, excluding pre-announced maintenance. Credits per the standard
  SLA doc (TBD; not in this directory).
- **Project = subscription.** One Polar subscription per hela project,
  not per account. Different projects on the same account can be on
  different tiers. Region is fixed at project create.

## Polar wiring

There are **two** Polar organizations behind hela today, one per
Railway environment:

| Railway env | Polar org | host | org id |
| --- | --- | --- | --- |
| `production` | `hela` | `api.polar.sh` | `34179383-d80b-41e6-afc3-f745d6b138ca` |
| `dev` | `hela` (sandbox) | `sandbox-api.polar.sh` | `6f6a5c08-5439-429e-9a17-0dcb6e587412` |

Each environment has its own product IDs — the IDs are **not portable
across environments**. Each per-tier file below lists both. The
`control` service picks which org to talk to via `POLAR_ENV`
(`sandbox` or `production`) and resolves product IDs from these
env vars:

| env var | plan |
| --- | --- |
| `POLAR_PRODUCT_STARTER` | starter |
| `POLAR_PRODUCT_GROWTH` | growth |
| `POLAR_PRODUCT_SCALE` | scale |

Free and Enterprise are not Polar-billed: Free has no subscription at
all (project rows are flagged `tier = "free"` in the control DB) and
Enterprise is invoiced out of band.

The webhook endpoint URL is the production control service in both
environments (the dev env reuses the production-Railway control URL —
sandbox webhooks are typically forwarded via Polar's CLI to a local
machine during development). Each org has its own webhook signing
secret pinned in `POLAR_WEBHOOK_SECRET`.

## Where this catalog appears

If you change a plan, update **every** surface in this list. Grep
hints in parens.

- This directory — canonical, edit here first.
- [`README.md`](../../README.md) — the "Hosted product pricing" table.
  Should match the rows above. (`grep -nE 'Starter|Growth|Scale' README.md`)
- [`apps/web/src/components/Pricing.tsx`](../../apps/web/src/components/Pricing.tsx)
  — the public landing-page pricing card. Same caps and CTAs.
- [`apps/app/src/routes/NewProject.tsx`](../../apps/app/src/routes/NewProject.tsx)
  — the in-app project picker. Short blurb only.
- [`apps/control/lib/control/billing.ex`](../../apps/control/lib/control/billing.ex)
  — Polar wrapper. The product IDs come from `runtime.exs`, not
  hardcoded, but the slugs are.
- [`apps/gateway/lib/hela/quota.ex`](../../apps/gateway/lib/hela/quota.ex)
  — runtime enforcement of connection / rate caps.
- [`packages/sdk-types/src/index.ts`](../../packages/sdk-types/src/index.ts)
  — the `Tier` union and `TIER_PRICE` map. SDK-visible.
- The Polar dashboard itself — the `description` field on each
  product should match the one-liner here verbatim.
