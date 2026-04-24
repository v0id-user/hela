# apps/control

Control plane for hela. One global Phoenix app; owns the account,
project, and API-key boundary. Talks to regional gateways over HTTP.

## Run locally

```
make setup          # from repo root
make dev.control    # just this app
```

Listens on `:4000` in dev (gateway is on `:4001`).

## Endpoints

Public:

| Method | Path                | Purpose                         |
| ------ | ------------------- | ------------------------------- |
| POST   | /auth/signup        | email signup (creates Polar customer) |
| POST   | /auth/login         | session cookie                  |
| POST   | /auth/logout        | clear session                   |
| POST   | /webhooks/polar    | Polar event handler            |

Session-gated (`/api/*`):

| Method | Path                                 |
| ------ | ------------------------------------ |
| GET    | /api/me                              |
| GET    | /api/projects                        |
| POST   | /api/projects                        |
| GET    | /api/projects/:id                    |
| PATCH  | /api/projects/:id                    |
| DELETE | /api/projects/:id                    |
| PUT    | /api/projects/:id/jwk                |
| GET    | /api/projects/:id/keys               |
| POST   | /api/projects/:id/keys               |
| DELETE | /api/projects/:id/keys/:key_id       |

## Outbound sync

Every project or API-key mutation ends with a `Control.Sync.push_*`
call that POSTs to each relevant region's gateway over HTTP with the
`x-hela-internal` header secret. Failures are logged but don't roll
back the control-plane mutation — we favour availability and reconcile
on a periodic sweep (not implemented at v1).

## Directory

```
lib/
├── control.ex
├── control/
│   ├── application.ex
│   ├── repo.ex
│   ├── release.ex           migrate task
│   ├── id.ex
│   ├── accounts/
│   │   ├── account.ex
│   │   ├── project.ex
│   │   └── api_key.ex
│   ├── accounts.ex          public context
│   ├── billing.ex           Polar wrapper
│   └── sync.ex              push to regional gateways
└── control_web/
    ├── endpoint.ex
    ├── router.ex
    ├── plugs/
    │   └── require_account.ex
    └── controllers/
        ├── auth_controller.ex
        ├── projects_controller.ex
        ├── keys_controller.ex
        ├── polar_webhook_controller.ex
        └── page_controller.ex
```
