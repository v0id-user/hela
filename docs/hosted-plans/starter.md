# Starter

> 1000 connections · 10M messages/mo

The first paid tier. Single region, no SLA, but enough headroom for a
real production app with thousands of concurrent users.

## Caps

| field | value |
| --- | --- |
| price | $19 / mo |
| connections (concurrent, hard cap) | 1,000 |
| messages / month (soft cap, billable overage) | 10,000,000 |
| publish rate (per channel, steady) | 15 / s |
| regions | 1 |
| history retention (per channel) | 10,000 messages |
| SLA | none |

Messages above the cap are billed at **$0.50 per million** on the
next invoice. Connection cap is hard.

## Wiring

| field | value |
| --- | --- |
| slug | `starter` |
| Polar product (production) | `a57f460b-649b-45a2-8cd9-71da6a62dc0f` |
| Polar product (sandbox) | `6963041e-48e7-4705-8c72-50ac01a915fa` |
| Polar env var (control service) | `POLAR_PRODUCT_STARTER` |
| Polar description | `1000 connections · 10M messages/mo` |

The Polar `description` field must match the line above this section
verbatim — it is the catalog string customers see at checkout.

## CTAs

| surface | label |
| --- | --- |
| public pricing page | `[ get Starter ]` |
| in-app project picker | `Starter` (radio button, blurb: `1k conns · 10M msgs/mo`) |
