# roadmap

This is a status map, not a promise list.

## stable enough for MVP

- Gateway channels: join, publish, subscribe.
- Presence state/diff over Phoenix Presence.
- History: ETS cache plus Postgres fallback.
- API keys with one-time plaintext display and hashed gateway mirror.
- Server-issued short-lived JWTs via `/v1/tokens`.
- TypeScript SDK and generated TypeScript/Python wire types.
- Local Docker/Postgres development path.
- Railway deployment path for the current hosted stack.

## beta

- Customer dashboard: project CRUD, API keys, JWK registration, billing view.
- Python, Go, and Rust SDKs.
- Hosted billing through Polar.
- Public playground and status page.
- Browser E2E coverage for signup/project/key creation.

## experimental

- Multi-region routing. Only `ams` is live on the hosted plane today.
- Cross-region relay for scale-tier projects.
- Fly deployment manifests.
- Usage dashboards and invoice-grade metering.
- Public hosted signup. Rate limits and invite-only mode exist, but email
  verification and a real abuse desk are not implemented.

## next hardening work

1. Add email verification and password reset.
2. Persist invoice-grade usage counters outside node-local ETS.
3. Add OpenTelemetry exporters and dashboard templates.
4. Publish JS/Python/Rust SDK release workflows consistently.
5. Replace provisional Railway URLs with custom domains.
6. Decide whether the hosted product remains in scope or whether the repo
   should stay self-host-only.
