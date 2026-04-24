# hela docs

hela is a managed real-time service on Elixir/BEAM. You get a
WebSocket endpoint per region, a REST surface for server-side use,
and SDKs that wrap both.

```python
from hela import connect

async with (await connect(region="iad", token=my_jwt)) as client:
    chat = client.channel("chat:lobby")
    await chat.join(nickname="alice")
    await chat.publish("hello")
```

## where to go next

| you want to… | read |
| --- | --- |
| ship your first message in 5 minutes | [quickstart](./quickstart.md) |
| understand the system | [architecture](./architecture.md) |
| mint tokens / publish from a backend | [api/rest](./api/rest.md) |
| drive the socket by hand | [api/websocket](./api/websocket.md) |
| use the Python SDK | [sdk/python](./sdk/python.md) |
| use the TypeScript SDK | [sdk/typescript](./sdk/typescript.md) |
| use the Go SDK | [sdk/go](./sdk/go.md) |
| use the Rust SDK | [sdk/rust](./sdk/rust.md) |
| add a Swift / Kotlin / … SDK | [sdk/adding-a-language](./sdk/adding-a-language.md) |
| run ops on a live region | [runbook](./runbook.md) |

## regions

Five hosted clusters, plus a `dev` region that points at a local
Elixir process. Pick the one closest to most of your users:

| slug | city | host |
| --- | --- | --- |
| `iad` | Ashburn, US East | `iad.hela.dev` |
| `sjc` | San Jose, US West | `sjc.hela.dev` |
| `ams` | Amsterdam, EU | `ams.hela.dev` |
| `sin` | Singapore, Asia | `sin.hela.dev` |
| `syd` | Sydney, AU | `syd.hela.dev` |
| `dev` | localhost | `localhost:4001` |

Regions are isolated — there is no cross-region BEAM mesh. Scale-tier
projects can opt into multi-region relay; see [architecture](./architecture.md)
for the topology.

## conventions

- **AGPL-3.0-or-later.** The server is copyleft to protect against
  someone standing up a closed SaaS fork. SDKs are the same license,
  but linked client code doesn't trigger AGPL's server-side clause.
- **Schemas are the source of truth.** `packages/schemas/` holds JSON
  Schema for every WS event and an OpenAPI 3.1 spec for the REST
  surface. SDK type modules are generated from these — no drift
  possible.
- **Phoenix Channel v2 wire protocol.** The WebSocket speaks
  `[join_ref, ref, topic, event, payload]` over JSON. If you want
  something exotic (protobuf, msgpack), open an issue — the gateway
  side is tidy enough that a second codec is an afternoon's work.
