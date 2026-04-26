#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "datamodel-code-generator[http]>=0.26",
#     "ruff>=0.6",
# ]
# ///
"""
hela sdk codegen.

Reads packages/schemas/** and regenerates type definitions across every
SDK that needs them. Invoked via `make sdk.gen`. Safe to re-run; output
is deterministic and committed so CI can diff for drift.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
SCHEMAS = ROOT / "packages" / "schemas"
WIRE = SCHEMAS / "wire"
OPENAPI = SCHEMAS / "openapi.yaml"

SDK_PY_GEN = ROOT / "packages" / "sdk-py" / "src" / "hela" / "_generated"
SDK_TS_GEN = ROOT / "packages" / "sdk-types" / "src" / "_generated.ts"

# Pinned via PATH-resolved bunx invocation. quicktype is installed as
# a transient bunx dependency on first run; bun caches it locally so
# subsequent runs are instant.
QUICKTYPE_VERSION = "23.2.6"


def _banner(label: str) -> None:
    print(f"\n== {label} ==")


def _run(cmd: list[str]) -> None:
    print("  $", " ".join(cmd))
    subprocess.run(cmd, check=True)


def gen_python() -> None:
    """
    Python — Pydantic v2 models for both wire and REST shapes.

    datamodel-codegen handles $ref across files transparently. We emit
    two files so the import path communicates intent:
        hela._generated.wire  — WS event payloads
        hela._generated.rest  — REST request/response bodies
    """
    _banner("python sdk types")
    SDK_PY_GEN.mkdir(parents=True, exist_ok=True)
    (SDK_PY_GEN / "__init__.py").write_text(
        '"""Auto-generated from packages/schemas/. Do not edit."""\n'
    )

    # ---- wire (one file, all WS payloads) ---------------------------
    # We point datamodel-codegen at the `_index.schema.json` umbrella
    # so $ref-linked schemas resolve and we get ONE output file rather
    # than one per schema.
    _run(
        [
            "datamodel-codegen",
            "--input",
            str(WIRE / "_index.schema.json"),
            "--input-file-type",
            "jsonschema",
            "--output",
            str(SDK_PY_GEN / "wire.py"),
            "--output-model-type",
            "pydantic_v2.BaseModel",
            "--target-python-version",
            "3.11",
            "--use-standard-collections",
            "--use-double-quotes",
            "--use-field-description",
            "--use-schema-description",
            "--use-title-as-name",
            "--disable-timestamp",
            "--custom-file-header",
            "# Auto-generated from packages/schemas/wire/. Do not edit.\n# Run `make sdk.gen` after changing a schema.",
        ]
    )

    # ---- rest (from openapi) ----------------------------------------
    _run(
        [
            "datamodel-codegen",
            "--input",
            str(OPENAPI),
            "--input-file-type",
            "openapi",
            "--output",
            str(SDK_PY_GEN / "rest.py"),
            "--output-model-type",
            "pydantic_v2.BaseModel",
            "--target-python-version",
            "3.11",
            "--use-standard-collections",
            "--use-double-quotes",
            "--use-field-description",
            "--use-schema-description",
            "--disable-timestamp",
            "--custom-file-header",
            "# Auto-generated from packages/schemas/openapi.yaml. Do not edit.\n# Run `make sdk.gen` after changing the spec.",
        ]
    )

    # Post-format with ruff. datamodel-code-generator's `--formatters`
    # flag is fragile across versions; running `ruff format` ourselves
    # is portable and produces output that matches sdk-py's CI checks
    # byte-for-byte.
    _run(["ruff", "format", str(SDK_PY_GEN / "wire.py"), str(SDK_PY_GEN / "rest.py")])

    print(f"  wrote: {SDK_PY_GEN.relative_to(ROOT)}/wire.py")
    print(f"  wrote: {SDK_PY_GEN.relative_to(ROOT)}/rest.py")


def gen_typescript() -> None:
    """
    TypeScript — wire types as plain interfaces.

    quicktype is the only single tool that targets TS, Go and Rust
    from JSON Schema; we use it for TS today and may grow to cover
    more languages later. `--just-types` strips the runtime helpers
    so the package stays dependency-free. `--no-date-times` keeps
    `inserted_at` as `string` so the SDK does not implicitly turn
    every payload into `Date` objects on receipt — which would break
    consumers that pass the wire shape through unchanged.
    """
    _banner("typescript sdk types")
    SDK_TS_GEN.parent.mkdir(parents=True, exist_ok=True)

    _run(
        [
            "bunx",
            f"quicktype@{QUICKTYPE_VERSION}",
            "--src-lang",
            "schema",
            "--src",
            str(WIRE / "_index.schema.json"),
            "--lang",
            "typescript",
            "--just-types",
            "--top-level",
            "Wire",
            "--no-date-times",
            "--out",
            str(SDK_TS_GEN),
        ]
    )

    # Prepend a "do not edit" header. quicktype with --just-types
    # emits no header of its own.
    body = SDK_TS_GEN.read_text()
    header = (
        "// Auto-generated from packages/schemas/wire/. Do not edit.\n"
        "// Run `make sdk.gen` after changing a schema.\n"
        "//\n"
        "// quicktype emits a top-level `Wire` interface with every event\n"
        "// as an optional field. It is a place-holder; consumers should\n"
        "// import individual types (`Message`, `JoinReply`, etc.) by name.\n"
        "\n"
    )
    SDK_TS_GEN.write_text(header + body)

    # Run prettier so the file matches the rest of the repo's TS.
    _run(["bunx", "--bun", "prettier", "--write", str(SDK_TS_GEN)])

    print(f"  wrote: {SDK_TS_GEN.relative_to(ROOT)}")


def main() -> int:
    if not WIRE.exists():
        print(f"ERR: schemas dir missing at {WIRE}", file=sys.stderr)
        return 1

    gen_python()
    gen_typescript()
    print("\ndone.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
