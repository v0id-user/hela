# hela/packages/schemas

Single source of truth for every hela wire shape. Two files, two
concerns:

| file                     | surface                | fed into                     |
| ------------------------ | ---------------------- | ---------------------------- |
| `openapi.yaml`           | REST API               | OpenAPI client generators    |
| `wire/*.schema.json`     | WebSocket payloads     | `datamodel-codegen` + quicktype |

Every SDK (`sdk-js`, `sdk-py`, future `sdk-go/rs/swift/...`) draws its
type definitions from here via `packages/sdk-gen/`. The Elixir gateway
serialises to match. A round-trip test in CI publishes through each SDK
and validates the received frame against the schema — that's how we
catch drift.

## conventions

- **One file per event**: `publish_request.schema.json`, `message.schema.json`,
  etc. Keeps diffs reviewable.
- **`$id` is a URL under `https://hela.dev/schemas/wire/`**: stable,
  human-readable, resolvable someday when we host a spec page.
- **All schemas are JSON Schema draft-07**: widest tool compatibility
  (quicktype, datamodel-codegen, ajv, everything).
- **Additional properties disallowed**: `"additionalProperties": false`
  on every object. Forces us to evolve schemas intentionally, not
  by accident.
- **Required fields are listed**: even on incoming events. Optional
  fields use `"type": ["string", "null"]` or omit the required entry.

## adding a new event

1. Write `wire/<event>.schema.json`.
2. Update the relevant ProjectChannel handler in `apps/gateway/lib/hela_web/channels/project_channel.ex` to match.
3. Regenerate SDK types: `make sdk.gen`.
4. Add a test in `scripts/e2e.py` or the per-lang SDK that exercises it
   and validates the received frame against the schema.
