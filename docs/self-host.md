# self-host quickstart

This path exercises the product locally: control plane, gateway, dashboard,
project creation, API key issuance, token minting, and SDK connection.

## prerequisites

- Docker
- Elixir/OTP matching `mise.toml`
- Bun
- uv
- jq

## 1. boot the stack

```sh
make setup
make dev
```

Leave that terminal running. The local services are:

| service | url                     |
| ------- | ----------------------- |
| control | `http://localhost:4000` |
| gateway | `http://localhost:4001` |
| web     | `http://localhost:5173` |
| app     | `http://localhost:5174` |

## 2. create an account

```sh
CONTROL=http://localhost:4000
GATEWAY=http://localhost:4001

CSRF=$(curl -sS "$CONTROL/auth/csrf" -c cookies.txt | jq -r .csrf_token)

curl -sS "$CONTROL/auth/signup" \
  -H 'content-type: application/json' \
  -H "x-csrf-token: $CSRF" \
  -b cookies.txt -c cookies.txt \
  -d '{"email":"local@example.com","password":"correct-horse-battery"}' | jq .
```

## 3. create a project and API key

```sh
PROJECT_ID=$(
  curl -sS "$CONTROL/api/projects" \
    -H 'content-type: application/json' \
    -H "x-csrf-token: $CSRF" \
    -b cookies.txt -c cookies.txt \
    -d '{"name":"local-demo","region":"iad","tier":"free"}' \
  | jq -r .project.id
)

API_KEY=$(
  curl -sS "$CONTROL/api/projects/$PROJECT_ID/keys" \
    -H 'content-type: application/json' \
    -H "x-csrf-token: $CSRF" \
    -b cookies.txt -c cookies.txt \
    -d '{"label":"local"}' \
  | jq -r .wire
)
```

## 4. mint a browser token

```sh
TOKEN=$(
  curl -sS "$GATEWAY/v1/tokens" \
    -H "authorization: Bearer $API_KEY" \
    -H 'content-type: application/json' \
    -d '{"sub":"local-user","chans":[["read","chat:*"],["write","chat:*"]],"ttl_seconds":600}' \
  | jq -r .token
)
```

## 5. connect with the TypeScript SDK

```sh
HELA_CONTROL=http://localhost:4000 \
HELA_GATEWAY=http://localhost:4001 \
bun run scripts/sdk_e2e.ts
```

For browser validation, open `http://localhost:5174`, sign in with the account
above, create a project, issue a key, and use the quickstart snippet on the
project detail page.

## hosted abuse controls

Self-hosted installs are open by default. For a public hosted control plane:

- `HELA_SIGNUP_MODE=open` allows normal signup.
- `HELA_SIGNUP_MODE=invite` requires `invite_code` to match one of
  `HELA_INVITE_CODES=alpha,beta,...`.
- `HELA_SIGNUP_MODE=closed` disables signup.

Signup and login also have per-IP fixed-window limits. They are intentionally
small and dependency-free; put Cloudflare, Fly, Railway edge rules, or another
edge limiter in front of a serious public deployment.
