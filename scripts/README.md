# scripts

Operational scripts for validating the deployed hela platform.

## `e2e.py` — full end-to-end test (Python 3.14, stdlib + uv inline deps)

Talks to the live Railway deploy over raw HTTP + Phoenix Channel v2 WebSocket protocol. Platform-level validation, no SDK.

```
uv run scripts/e2e.py                  # uses the deployed URLs
HELA_GATEWAY=http://localhost:4001 \
HELA_CONTROL=http://localhost:4000 \
  uv run scripts/e2e.py                # against local dev
```

Exercises: signup → session cookies → project → API key → `/v1/tokens` → WS connect → channel join → publish → receive → history → second client → presence CRDT → rate limiter. Ten checkpoints, typically ≤10s wall-clock.

Dependencies are declared inline at the top of the script (PEP 723 style); `uv run` resolves them into a one-shot venv.

## `sdk_e2e.mjs` — SDK shape test (JavaScript, Bun)

Installs `@hela/sdk` as a customer would (`file:` workspace link) and drives the flow with the SDK's typed surface — `connect()`, `channel()`, `channel.publish()`, `channel.onMessage()`, `channel.history()`, `presence.onSync()`.

This one stays JavaScript on purpose: the SDK's job is to be a JS library, so the only way to validate its public API is from a JS consumer. Same reason you'd test a Rust crate in Rust.

```
# One-time: copy the SDK packages into a scratch dir with file: deps
mkdir /tmp/hela-sdk-test && cd /tmp/hela-sdk-test
cp -r <repo>/packages/sdk-types ./sdk-types
cp -r <repo>/packages/sdk-js ./sdk-js
# Patch sdk-js/package.json so @hela/sdk-types resolves to ./sdk-types
# (the workspace protocol only works inside the monorepo)
bun init -y
bun add file:./sdk-js file:./sdk-types phoenix

# Run
cp <repo>/scripts/sdk_e2e.mjs ./test.mjs
bun run test.mjs
```
