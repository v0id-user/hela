# Free

> 100 connections · 1M messages/mo · single region

The starting tier. No subscription, no card. Intended for prototypes,
hobby projects, and the first day of evaluating hela.

## Caps

| field | value |
| --- | --- |
| price | $0 |
| connections (concurrent, hard cap) | 100 |
| messages / month (soft cap, no overage) | 1,000,000 |
| publish rate (per channel, steady) | 5 / s |
| regions | 1 |
| history retention (per channel) | 1,000 messages |
| SLA | none |

The Free tier has **no overage**. When the monthly message cap is hit,
publishes return `quota_exceeded` until the next billing day. This is
the only tier where the message cap is hard.

## Wiring

| field | value |
| --- | --- |
| slug | `free` |
| Polar product | none — Free projects have no subscription |
| control DB | project row with `tier = "free"` |

## CTAs

| surface | label |
| --- | --- |
| public pricing page | `[ start free ]` |
| in-app project picker | `Free` (radio button) |
