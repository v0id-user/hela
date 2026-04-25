# Growth

> 10k connections · 100M messages/mo · 99.9% SLA

The "most picked" tier on the public pricing page. First tier with an
SLA. Still single region; multi-region requires Scale.

## Caps

| field | value |
| --- | --- |
| price | $99 / mo |
| connections (concurrent, hard cap) | 10,000 |
| messages / month (soft cap, billable overage) | 100,000,000 |
| publish rate (per channel, steady) | 100 / s |
| regions | 1 |
| history retention (per channel) | 100,000 messages |
| SLA | 99.9% |

Messages above the cap are billed at **$0.50 per million** on the
next invoice. Connection cap is hard.

## Wiring

| field | value |
| --- | --- |
| slug | `growth` |
| Polar product (production) | `ac384ffa-7143-44fc-b8c6-3b4a52f7b139` |
| Polar product (sandbox) | `6fa1da26-f2f9-494d-b114-dfbdd0614576` |
| Polar env var (control service) | `POLAR_PRODUCT_GROWTH` |
| Polar description | `10k connections · 100M messages/mo · 99.9% SLA` |

The Polar `description` field must match the line above this section
verbatim — it is the catalog string customers see at checkout.

## CTAs

| surface | label |
| --- | --- |
| public pricing page | `[ get Growth ]` (featured, "most picked" ribbon) |
| in-app project picker | `Growth` (radio button, blurb: `10k conns · 100M msgs/mo · 99.9% SLA`) |
