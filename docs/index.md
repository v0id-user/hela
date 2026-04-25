# hela docs

**Open source and self-hostable first:** hela is a full stack
realtime platform on Elixir/BEAM, offered as the **hosted** public
regions second. The two paths share the same monorepo: a WebSocket
endpoint per region, a REST surface for server-side use, and SDKs
with every wire and REST type generated from `packages/schemas/`.
Proprietary pub/sub and presence services are the comparison, not
the default way you are expected to run the software.

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
| see what each hosted plan includes | [hosted-plans](./hosted-plans/README.md) |
| run ops on a live region | [runbook](./runbook.md) |

## regions

This table is for the **public hosted** product. If you are self
hosting, your region list is whatever you configure in your own
deploy. Five **hosted** clusters, plus a `dev` region that points at
a local Elixir process, when you are using the shared service. Pick
the one closest to most of your users:

| slug | city | host |
| --- | --- | --- |
| `ams` | Amsterdam, EU | `gateway-production-bfdf.up.railway.app` |
| `dev` | localhost | `localhost:4001` |

Only `ams` is live today on the hosted plane (single Railway service).
`iad`, `sjc`, `sin`, `syd` are planned regions; until they come up,
every slug resolves to the Amsterdam gateway via the SDK region map.
The URL above is provisional — a real custom domain will land before
wider launch.

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
