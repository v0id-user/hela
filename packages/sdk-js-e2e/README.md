## sdk-js-e2e

Playwright coverage for the launch-critical `@hela/sdk` browser flow.

### Local preview

From the repo root:

```sh
bun run test:e2e
```

This builds `apps/web`, serves a local preview, and exercises that bundle
against the configured gateway/control/app URLs.

### Against a deployed site

```sh
HELA_E2E_BASE_URL="https://web-production-f24fc.up.railway.app" \
HELA_GATEWAY_URL="https://gateway-production-bfdf.up.railway.app" \
HELA_CONTROL_URL="https://control-production-059e.up.railway.app" \
HELA_APP_URL="https://app-production-1716a.up.railway.app" \
  bun run test:e2e
```

Failure artifacts land in:

- `packages/sdk-js-e2e/playwright-report/`
- `packages/sdk-js-e2e/test-results/`
