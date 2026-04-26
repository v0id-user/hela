# hela — brand book

The single source of truth for how to talk about hela and how the
hela identity shows up in the world. Everything you need to:

- write copy about the project (tweet, README, press release, ad),
- pick the right asset for the surface you're putting it on,
- avoid the small set of things that visibly break the brand.

If you want pure asset files, jump to [`README.md`](../../../../README.md#brand) —
it has the inventory table with sizes, formats, and rasterisation
recipe. This file is the **voice + visual rules** layer on top.

> The brand assets in this directory are a trademark carve-out from
> the repo's AGPL-3.0-or-later license — see [`LICENSE.md`](LICENSE.md).
> The code is forkable. The identity isn't.

---

## 1. The project, in one breath

**hela is open-source managed real-time on BEAM.** Channels,
presence, history, sequencing, JWT auth — the same monorepo you can
self-host or use as a hosted service.

That sentence is the spine. Every shorter or longer description
below reduces or expands it without changing what's true.

---

## 2. Names, spellings, formatting

- The product name is **`hela`** — lowercase, always. Not Hela, not
  HELA, not Hēla. Lowercase even at the start of a sentence.
- The wordmark is **`[ hela ]`** — square brackets with single spaces
  inside, gold brackets and silver letters. The brackets are part of
  the mark, not punctuation around it. Don't write `[hela]` (no
  space) and don't drop the brackets in display contexts.
- In running prose where you can't use the visual mark, just write
  hela. No backticks, no italics, no quotes.
- The repository is `v0id-user/hela` on GitHub. Don't invent a
  different org.
- The maintainer is **#V0ID** (`hey@v0id.me`). Use that when crediting.
- We do **not** own a custom domain. Don't reference one in copy.
  Live URLs are Railway slugs (e.g. `gateway-production-bfdf.up.railway.app`).

---

## 3. One-liners

Pick the one that fits the constraint. They're not interchangeable —
each was tuned for a specific surface.

| length / context                                   | one-liner                                                                                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **40 chars** (favicon-adjacent, X bio)             | `managed real-time on BEAM`                                                                                                          |
| **60 chars** (GitHub repo description)             | `open-source managed real-time on Elixir/Phoenix — channels, presence, history`                                                      |
| **80 chars** (ProductHunt tagline, OG description) | `the open-source real-time backend on BEAM. self-host the same code we run.`                                                         |
| **120 chars** (npm `description`, package manager) | `channels, presence, history, JWT auth on Elixir/Phoenix. open source, with a hosted service for teams that don't want to run BEAM.` |
| **conference bio (1 sentence)**                    | `hela is open-source real-time infrastructure on BEAM — channels, presence, and history with the same code you can self-host.`       |

If you need a new one-liner for a new surface, write it from the
spine (§1) and keep it lowercase.

---

## 4. Descriptions, by length

### Short (~30 words, app-store / package-manager blurb)

> hela is open-source real-time infrastructure on BEAM. Channels,
> presence, history, JWT auth. Run it yourself, or use the hosted
> service — same code, same behaviour, same wire format.

### Medium (~80 words, README hero / ProductHunt body)

> hela is the open-source stack for managed real-time on Elixir
> and Phoenix. You get sub-100ms channels, CRDT presence, ETS-backed
> history, UUIDv7-ordered messages, and a JWT auth model — all in a
> single monorepo you can fork and self-host. The hosted service
> runs the exact same code on Railway. SDKs in TypeScript, Python,
> Go, and Rust, with a JSON-Schema + OpenAPI source of truth and
> generated wire types.

### Long (~250 words, About page / press release lead)

> hela is open-source real-time infrastructure built on Elixir,
> Phoenix Channels, and the BEAM virtual machine — the same runtime
> WhatsApp, Discord's chat backend, and Phoenix LiveView are built
> on. The whole thing is one monorepo: a regional gateway service
> (Phoenix + Bandit + Broadway), a control plane for accounts and
> billing, two web frontends, and four SDKs (TypeScript, Python, Go,
> Rust) generated from a single JSON Schema + OpenAPI spec.
>
> The hot path is one process per WebSocket, ETS ring buffers per
> channel for sub-microsecond reads, Phoenix.PubSub for cluster-wide
> fan-out, Phoenix.Presence for CRDT-replicated roster state, and
> Broadway for batched persistence into a per-region Postgres. The
> wire is Phoenix Channel v2 frames; ids are UUIDv7 so cursor
> pagination is free.
>
> You can run hela yourself — `docker compose up` is a working dev
> environment, and the same Dockerfiles deploy to any container
> platform. Or you can use the hosted service, which runs the same
> code on Railway with a single Amsterdam region today and more
> coming. Pricing on the hosted service is flat tiers, not metered —
> we don't want adversarial billing incentives between us and you.
>
> Built and maintained by #V0ID. AGPL-3.0-or-later. The brand is a
> trademark carve-out; the code is forkable.

### Boilerplate (canned end-of-press-release "About hela")

> **About hela.** hela is open-source managed real-time
> infrastructure on Elixir/Phoenix and the BEAM. Channels, presence,
> history, sequencing, and JWT auth in a single monorepo, with SDKs
> for TypeScript, Python, Go, and Rust. Self-hostable under
> AGPL-3.0-or-later, or available as a hosted service. More at
> [github.com/v0id-user/hela](https://github.com/v0id-user/hela).

---

## 5. Voice & tone

The voice is **terminal-honest**. Read your draft aloud. If a
sentence sounds like it could be on a billboard at SFO, rewrite it.

### Do

- **Lowercase by default.** sentences, headings, button labels.
  capital letters only for proper nouns inside copy (Elixir,
  Phoenix, BEAM, Railway, Polar, etc.).
- **Concrete numbers over adjectives.** "sub-100ms" beats "fast".
  "500k connections per node" beats "highly scalable".
- **Name the thing.** "Phoenix.PubSub" instead of "our pub-sub
  layer". "ETS ring buffer" instead of "in-memory cache".
- **Show the constraint.** "five regions, not 300 cities" tells the
  reader what we are and what we aren't, in the same phrase.
- **Bracket motif.** `[ start free ]`, `[ open polar portal ]`,
  `> connecting...`. The product is a terminal thing; the copy
  carries that.

### Don't

- **No empty superlatives.** "lightning-fast", "best-in-class",
  "next-generation", "blazing", "powerful", "cutting-edge",
  "robust", "seamless". If you wrote one, delete it.
- **No emojis in product copy.** ✨🚀 are off-brand. Code blocks and
  monospace ASCII are on-brand.
- **No exclamation marks.** Period is enough.
- **No "we believe" / "we think" / "we feel".** State the position;
  the byline is the belief signal.
- **Don't lecture about BEAM.** Most readers know what they need to
  know. Two sentences of "why BEAM" is enough; ten paragraphs is a
  red flag the product story is weak.
- **Don't reference hela.dev.** We don't own that domain. Every URL
  in copy must be either GitHub or a Railway live URL.

### Voice reference

When in doubt, read [`apps/web/src/routes/How.tsx`](../../src/routes/How.tsx)
and the [hero strip copy](../../src/components/Hero.tsx) in the
marketing site. That's the calibration. New copy should sit
comfortably next to it.

---

## 6. What hela is not (positioning by negation)

These are the lines you can use when a reader asks "but why not just
use X?":

- **Not edge-everywhere.** No 300-city POP network. Five regions
  with full Postgres + Channels stacks; Cloudflare Durable Objects
  is the right answer if you need 300 cities.
- **Not scale-to-zero.** Two replicas hot per region, always.
  Cold-start a WebSocket backend is a bad customer experience.
- **Not metered.** Flat tier caps + overage only at the top end.
  Per-message billing creates adversarial incentives.
- **Not multi-protocol.** Phoenix Channel v2 wire format. If you
  want raw MQTT or AMQP, use something else.
- **Not Stripe-backed.** Polar handles billing. Don't ask us to
  re-add Stripe; we evaluated it and dropped it.
- **Not closed.** Every line of the code that powers the hosted
  service is in the repo. AGPL-3.0-or-later. The hosted service
  trades convenience for compliance, not feature gates.

---

## 7. Visual identity

Full asset inventory + sizes + rasterisation recipe lives in
[`README.md` § Brand](../../../../README.md#brand). This section is
**which asset to use when** plus the rules that aren't in the table.

### Asset → use

| surface                           | use this                | not this                                                     |
| --------------------------------- | ----------------------- | ------------------------------------------------------------ |
| Favicon (≤32 px)                  | `favicon.svg`           | `mark.svg` (3-dot version is too dense at 16 px)             |
| App icon (180 / 512 px)           | `mark.svg` (or its PNG) | `wordmark.svg` (won't read at icon size)                     |
| GitHub / Twitter / Discord avatar | `avatar.svg`            | `mark.svg` (avatar has the right padding for round crops)    |
| README hero, top of any docs page | `banner.svg`            | `og.svg` (og is for social previews, has different aspect)   |
| Social share / OG card            | `og.svg` (1200×630)     | anything else                                                |
| In-product header, app sidebar    | `wordmark.svg`          | `lockup.svg` (lockup has tagline; in-product is too crowded) |
| Press / pitch deck cover          | `lockup.svg`            | wordmark alone                                               |
| Animated / event-stream surfaces  | `signal.svg`            | `mark.svg` (signal has the kinetic version)                  |

### Palette

| role             | hex       | when to use                                            |
| ---------------- | --------- | ------------------------------------------------------ |
| background       | `#0a0a0a` | every dark-mode surface, OG card, banner               |
| accent           | `#c9a76a` | brackets, live dot, "live" status, single-emphasis CTA |
| type / main mark | `#c0c0c0` | wordmark letters, body emphasis on dark                |
| muted            | `#888`    | secondary text on dark                                 |
| muted-er         | `#555`    | tertiary text, trailing dots                           |
| line             | `#333`    | borders, dotted dividers                               |

The palette is **dark-first by design**. There is no light-mode
brand surface today. If you need to put hela on a white background
(slide deck, partner page), use `mark.svg` only — the wordmark and
lockup are tuned for dark.

### Typography

`"SF Mono", "JetBrains Mono", "Menlo", "DejaVu Sans Mono", monospace`

Mono everywhere. No sans-serif body face. Sizes:

- hero h1: 34 px
- section h2: 22 px
- body / panel: 13 px
- captions, labels, eyebrow: 10–11 px, uppercase, `letter-spacing: 1.5px`
- monospace tokens (channels, ids, code): 12 px in 13 px body

### Don't (visual misuse)

- Don't recolour the brackets. Gold (`#c9a76a`) is load-bearing.
- Don't tilt or rotate the wordmark. It reads `[ hela ]`, level.
- Don't put the wordmark on a coloured (non-`#0a0a0a`-ish) background.
- Don't add a drop shadow, glow, or gradient to any mark. Flat only.
- Don't redraw the mark in another typeface. The exact letterforms
  are the brand; a serif `[ hela ]` is a different brand.
- Don't combine the marks with another logo into a "vs." composite
  unless you're a partner with explicit written permission (see
  [`LICENSE.md`](LICENSE.md)).

---

## 8. Sample copy (steal these)

### Tweet / X post (≤280 chars)

> just shipped hela: open-source managed real-time on BEAM.
> channels, presence, history, JWT auth — same monorepo you can
> self-host or use as a hosted service. SDKs in TS, Python, Go,
> Rust. Elixir + Phoenix under the hood.
> github.com/v0id-user/hela

### ProductHunt tagline + first sentence

> **the open-source real-time backend on BEAM. self-host the same code we run.**
>
> hela gives you sub-100ms channels, CRDT presence, and ETS-backed
> history on Phoenix and Elixir — as a single monorepo you can fork,
> or as a hosted service that runs the exact same code.

### GitHub repo description (≤350 chars)

> open-source managed real-time on Elixir/Phoenix — channels,
> presence, history, JWT auth. self-host the same code that powers
> the hosted service. SDKs in TypeScript, Python, Go, and Rust,
> generated from a single JSON Schema + OpenAPI spec.

### npm / pypi / crates description

> Real-time channels, presence, and history on hela. Phoenix Channel
> v2 wire format, JWT auth, async client. Works against self-hosted
> hela or the hosted service — same code, same wire.

### Conference talk bio

> #V0ID is the maintainer of hela, an open-source managed real-time
> stack on Elixir and Phoenix. Previous work in distributed systems
> and developer tooling. hela is what happens when you stop
> abstracting BEAM away and ship the BEAM-shaped thing.

### Sponsorship / partner card

> Built on hela — open-source managed real-time on Elixir/Phoenix.
> [github.com/v0id-user/hela](https://github.com/v0id-user/hela)

---

## 9. Press / partner inquiries

- Repo: <https://github.com/v0id-user/hela>
- Maintainer: #V0ID — `hey@v0id.me`
- Brand asset master: this directory (`apps/web/public/brand/`)
- License questions (code): AGPL-3.0-or-later, see repo `LICENSE`
- License questions (brand): see [`LICENSE.md`](LICENSE.md) here —
  trademark carve-out from AGPL

If you want a high-res PNG that isn't already rasterised, run
`bash scripts/brand_render.sh` from the repo root after editing the
SVG, or open an issue.

---

## 10. Changelog for this brand book

Treat this like any other doc — when the brand voice or asset rules
change, update this file and link the commit from the entry below.

- **2026-04-24** — initial brand book. Voice baseline: terminal,
  lowercase, no superlatives. Visual baseline: dark-first, mono,
  bracket motif, gold accent. Captures everything that drifted into
  the hero, README, press notes, and SDK READMEs over the last two
  months and pins it.
