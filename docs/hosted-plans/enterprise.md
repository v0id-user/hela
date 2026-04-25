# Enterprise

> custom limits · all regions · 99.99% SLA

Not self-serve. Negotiated contract, invoiced out of band, not a
Polar product. The pricing page surfaces a "contact sales" CTA that
mails `hey@v0id.me`.

## Caps

| field | value |
| --- | --- |
| price | contact (custom contract) |
| connections (concurrent, hard cap) | custom |
| messages / month | custom |
| publish rate | custom |
| regions | all regions |
| history retention | custom |
| SLA | 99.99% |

Caps are negotiated per contract and provisioned manually in the
control DB. There is no Polar product to mirror — Enterprise customers
do not flow through the standard subscription path.

## Wiring

| field | value |
| --- | --- |
| slug | `ent` |
| Polar product | none — invoiced out of band |
| control DB | project row with `tier = "enterprise"`; caps overridden per contract |

Note that the slug is **`ent`** on the public pricing page (and in the
`Tier` union for the cohort that has it), not `enterprise`. Internal
docs use the long form.

## CTAs

| surface | label |
| --- | --- |
| public pricing page | `[ contact sales ]` (mailto `hey@v0id.me`) |
| in-app project picker | not offered self-serve |
