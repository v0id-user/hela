# Scale

> 100k connections · 1B messages/mo · multi-region · 99.95% SLA

The top self-serve tier. First tier with multi-region, the highest
self-serve SLA, and the only tier where cross-region relay is
available without an Enterprise contract.

## Caps

| field | value |
| --- | --- |
| price | $499 / mo |
| connections (concurrent, hard cap) | 100,000 |
| messages / month (soft cap, billable overage) | 1,000,000,000 |
| publish rate (per channel, steady) | 1,000 / s |
| regions | up to 3, replicated |
| history retention (per channel) | 1,000,000 messages |
| SLA | 99.95% |

Messages above the cap are billed at **$0.50 per million** on the
next invoice. Connection cap is hard.

Multi-region is opt-in per project. The relay topology is documented
in [`../architecture.md`](../architecture.md) — TL;DR: regional
clusters stay isolated, and Scale projects get a one-way per-region-pair
relay rather than a stretched mesh.

## Wiring

| field | value |
| --- | --- |
| slug | `scale` |
| Polar product (production) | `abfd4719-d8aa-4336-a10f-0c3004320047` |
| Polar product (sandbox) | `fcebd001-b8fd-4217-bf6d-9aeb443618c0` |
| Polar env var (control service) | `POLAR_PRODUCT_SCALE` |
| Polar description | `100k connections · 1B messages/mo · multi-region · 99.95% SLA` |

The Polar `description` field must match the line above this section
verbatim — it is the catalog string customers see at checkout.

## CTAs

| surface | label |
| --- | --- |
| public pricing page | `[ get Scale ]` |
| in-app project picker | `Scale` (radio button, blurb: `100k conns · 1B msgs/mo · multi-region`) |
