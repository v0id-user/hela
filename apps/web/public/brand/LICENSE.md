# hela brand assets — usage terms

**Short version:** the code in this repository is AGPL-3.0-or-later
and you can fork it. The **brand assets** in this directory
(`apps/web/public/brand/`) are *not* covered by that license. They
are the hela project's trademarks. Don't redraw them, don't ship
them as your product's identity, don't imply the hela project
endorses you.

---

## scope

These terms apply to everything under `apps/web/public/brand/`,
including but not limited to:

- the hela name and wordmark (`[ hela ]`)
- the hela mark, signal mark, lockup, banner, avatar, OG card, and
  favicon (every `.svg` and `.png` in this directory and
  subdirectories)
- any derivative, recolouring, or transformation of the above
- the visual system (palette, typography stack, bracket motif) when
  used in combination with the hela name

When these terms conflict with the repository's AGPL-3.0-or-later
[LICENSE](../../../../LICENSE) *for these files only*, these terms
govern.

## what you may do, without asking

- **Link unmodified assets** to refer to the hela project — blog
  posts, case studies, "integrates with hela" notices, tutorials.
- **Use the favicon** in your own compliance / "vendor detected"
  style dashboards and tooling.
- **Include the banner or og card** in slide decks, README files,
  and technical write-ups that accurately describe the hela project
  or your integration with it.
- **Use the wordmark in flowing text** exactly once per document
  when identifying the project. Please render it as `hela` in plain
  text thereafter.

Good-faith, accurate, non-misleading use is welcome.

## what you may not do, without written permission

- **Modify, redraw, or re-ink** the assets. The brackets, the dot
  spacing, the colour values are the mark. A "similar-but-ours"
  version is still a violation.
- **Use the assets as your own project's, product's, or company's
  primary identity.** The hela mark should not appear on someone
  else's landing page, app-store listing, or package registry as
  that entity's brand.
- **Imply endorsement, partnership, affiliation, sponsorship, or
  certification** by the hela project, its maintainers, or its
  owner. "Official hela plugin" is not something you get to claim
  on your own.
- **Merchandise** — stickers, t-shirts, mugs, conference booths,
  SWAG of any kind that ships the hela mark needs written
  permission. (Reach out; the answer is often yes.)
- **Use the mark in advertising** (paid or organic) where the mark
  carries your commercial weight, not ours.
- **Register the name, wordmark, or a confusingly-similar variant**
  as your own trademark, domain name, or package in any registry.

## if you fork hela and run your own version

AGPL lets you. The brand does not transfer. Before your fork goes
public:

- Rename it. Not "hela-plus", not "hela2", not "hela.io" — a real
  new name.
- Replace every asset in this directory with your own. The path
  pattern `apps/web/public/brand/` is fine; the contents cannot be
  ours.
- Replace the wordmark in `apps/web/src/` — the nav lockup, og
  card, title tag, any copy that says "hela".
- Replace the region mark language and any code comment that
  names "hela" as the service (e.g. `Hela.*` module names in
  `apps/gateway` and `apps/control`).

Running an internal deployment of hela at your company for your
employees is fine — no rename required, since it's not a public
service. The AGPL and these terms only engage when you are offering
the service to third parties under your own identity.

## permission + questions

Email **hey@v0id.me** with:

- what you want to do
- where the mark will appear
- whether money or business relationships are involved

We try to reply within a week. Silence is not consent; please wait
for an explicit yes.

## license of this file

This document is licensed
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) — you may
adapt the text for your own project's brand policy, with attribution.
