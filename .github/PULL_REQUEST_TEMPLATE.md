<!--
Thanks for the PR! Fill in what applies. Delete what doesn't.
-->

## What

<!-- One sentence: what does this change do? -->

## Why

<!-- What problem does it solve? Link the issue if there is one: Fixes #123. -->

## How

<!--
How did you solve it? Call out anything non-obvious — a tradeoff, a
benchmark, a future cleanup you're leaving on the table.
-->

## Verification

- [ ] `make lint` passes
- [ ] `make test` passes (both Elixir apps)
- [ ] `make e2e` passes against localhost OR the live deploy (noted which)
- [ ] I updated tests for anything I changed
- [ ] I updated docs (`README.md` / `docs/`) if behavior changed
- [ ] If this touches the SDK's public API, I updated `scripts/sdk_e2e.ts`

## Risk / rollout

<!--
Describe blast radius. Is this a data-plane change (risks outage)?
Control-plane change (risks billing)? SDK change (breaks customers)?
How would you roll it back?
-->

## Screenshots / logs

<!-- Optional. Especially useful for UI changes and dashboard tweaks. -->
