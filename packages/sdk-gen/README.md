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

| source                                | target                                        | tool                    |
| ------------------------------------- | --------------------------------------------- | ----------------------- |
| `packages/schemas/wire/*.schema.json` | `packages/sdk-py/src/hela/_generated/wire.py` | `datamodel-codegen`     |
| `packages/schemas/openapi.yaml`       | `packages/sdk-py/src/hela/_generated/rest.py` | `datamodel-codegen`     |
| `packages/schemas/wire/*.schema.json` | `packages/sdk-types/src/_generated.ts`        | `quicktype`             |
| `packages/schemas/wire/*.schema.json` | `packages/sdk-go/types.go`                    | handwritten drift check |
| `packages/schemas/wire/*.schema.json` | `packages/sdk-rs/src/types.rs`                | handwritten drift check |

TypeScript wire shapes are generated into `@hela/sdk-types`. Go and Rust keep
hand-written public structs because their serde/json behavior is curated, but
`gen.py` checks those structs against the schemas and fails on missing fields.

## drift protection

CI runs `uv run packages/sdk-gen/gen.py` and then `git diff --exit-code`.
If a schema or OpenAPI change affects generated Python/TypeScript output, the
PR must include that generated diff. If a schema adds/removes a property that
Go or Rust does not expose, the generator exits non-zero.

## adding a target language

1. `mkdir packages/sdk-<lang>`
2. Add a `gen_<lang>()` function in `gen.py` that stamps out type files
3. Commit the generated output alongside the hand-written transport
4. Add a step to CI (`.github/workflows/ci.yml` → `build-js`-style job
   for the language)

See `docs/sdk/adding-a-language.md` for the full recipe.
