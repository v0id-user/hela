# scripts

Operational scripts for validating the deployed hela platform.

## `e2e.py` — platform test (Python 3.13+, uv)

Talks to the live Railway deploy over raw HTTP + Phoenix Channel v2
WebSocket protocol. **No SDK** — this validates the backend in
isolation.

```
uv run scripts/e2e.py                  # uses the deployed URLs
HELA_GATEWAY=http://localhost:4001 \
HELA_CONTROL=http://localhost:4000 \
  uv run scripts/e2e.py                # against local dev
```

Dependencies declared inline at the top of the script (PEP 723); `uv run`
resolves them into a one-shot venv. Exercises: signup → session →
project → API key → `/v1/tokens` → WS join → publish → receive →
history → second client → presence CRDT → rate limiter. ≤10s wall-clock.

## `sdk_e2e.ts` — SDK surface test (TypeScript, Bun)

Imports `@hela/sdk` the way a customer would and drives the flow through
the SDK's typed API — `connect()`, `channel.publish()`, `channel.onMessage()`,
`presence.onSync()`, `channel.history()`. Catches SDK-shape bugs a raw-
protocol test can't (type surface regressions, missing timeout handlers,
etc.).

TypeScript instead of plain JS because Bun runs TS natively — no build
step, real types imported from `@hela/sdk`.

```
# One-time: copy the SDK packages into a scratch dir with file: deps.
# The monorepo's workspace: protocol doesn't resolve outside the repo,
# so we rewrite sdk-js's dep on sdk-types to a plain file: link.
mkdir /tmp/hela-sdk-test && cd /tmp/hela-sdk-test
cp -r <repo>/packages/sdk-types ./sdk-types
cp -r <repo>/packages/sdk-js   ./sdk-js
python3 -c "
import json, pathlib
p = pathlib.Path('sdk-js/package.json')
d = json.loads(p.read_text())
d['dependencies']['@hela/sdk-types'] = 'file:../sdk-types'
p.write_text(json.dumps(d, indent=2))
"
bun init -y
bun add file:./sdk-js file:./sdk-types phoenix

# Run
cp <repo>/scripts/sdk_e2e.ts ./test.ts
bun run test.ts
```

## Why two tests

| test | language | tests | catches |
| --- | --- | --- | --- |
| `e2e.py` | Python | backend wire protocol | server-side regressions |
| `sdk_e2e.ts` | TypeScript | `@hela/sdk` public API | SDK-shape regressions |

Raw-protocol tests don't notice when the SDK's `chat.history()` returns
the wrong shape, and SDK tests don't notice when the control plane's
/_internal/projects sync doesn't carry the jwt_signing_secret. Different
façades, both need coverage.
