# Security policy

## Supported versions

| Version | Supported           |
| ------- | ------------------- |
| `main`  | yes                 |
| `0.x`   | yes (pre-1.0, ongoing) |
| older   | no                  |

## Reporting a vulnerability

**Please do not open a public GitHub issue.**

Email **hey@v0id.me** (or use GitHub's private
[security advisory flow](https://github.com/v0id-user/hela/security/advisories/new)).
Include:

- a description of the issue
- reproduction steps or a minimal proof-of-concept
- what you think the impact is
- any fix ideas you have

You'll get a response within 72 hours. We treat reports in good faith
and we don't pursue researchers acting in good faith.

## What's in scope

- Tenant isolation breakage (anyone can reach another project's
  channels, history, or API keys)
- JWT / API-key validation bugs
- Anything that lets an anonymous user affect customer billing
- Denial of service against a single tenant from another tenant's
  traffic
- Secret leakage in logs, error responses, or the metrics firehose

## Out of scope (still report, but lower priority)

- DoS against the *entire* platform from unauthenticated traffic
  (that's a layer-7 rate-limit / ops concern, not a vuln)
- Findings that require physical access to Railway's infrastructure
- Issues already disclosed by upstream (Phoenix, Elixir, Postgres)
- Self-XSS, clickjacking without sensitive actions, open redirects
  with no auth impact

## Hardening in-progress

Things we know we want but haven't shipped yet (track in
`docs/security-roadmap.md`):

- [x] Per-project randomized JWT signing secret
- [x] JWT `pid` claim verified against project's registered JWK /
      server secret
- [x] Per-second rate limiting on publish per tier
- [ ] WAF in front of `control` for signup abuse
- [ ] Signed audit log for billing events
- [ ] Automatic rotation of API keys on a schedule
