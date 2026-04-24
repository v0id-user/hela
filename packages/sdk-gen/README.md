# hela/packages/sdk-gen

Regenerates type definitions for every SDK package from the specs in
`packages/schemas/`. One command, idempotent.

```sh
make sdk.gen
```

Or directly:

```sh
uv run packages/sdk-gen/gen.py
```

## what it does

| source                               | target                                    | tool                  |
| ------------------------------------ | ----------------------------------------- | --------------------- |
| `packages/schemas/wire/*.schema.json` | `packages/sdk-py/src/hela/_generated/models.py` | `datamodel-codegen` |
| `packages/schemas/openapi.yaml`      | `packages/sdk-py/src/hela/_generated/rest.py`  | `datamodel-codegen` |

TS doesn't get codegen — the hand-written `packages/sdk-types/` is the
source for `sdk-js`. We share prose in `docs/sdk/adding-a-language.md`
for when Go/Rust/Swift land.

## drift protection

Every SDK's integration test publishes a message, reads it back, and
validates the received frame against `message.schema.json`. If the
gateway ever emits a field the schema doesn't know about, or drops one
the schema requires, CI fails loudly on the next PR.

## adding a target language

1. `mkdir packages/sdk-<lang>`
2. Add a `gen_<lang>()` function in `gen.py` that stamps out type files
3. Commit the generated output alongside the hand-written transport
4. Add a step to CI (`.github/workflows/ci.yml` → `build-js`-style job
   for the language)

See `docs/sdk/adding-a-language.md` for the full recipe.
