#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "datamodel-code-generator[http]>=0.26",
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

    print(f"  wrote: {SDK_PY_GEN.relative_to(ROOT)}/wire.py")
    print(f"  wrote: {SDK_PY_GEN.relative_to(ROOT)}/rest.py")


def main() -> int:
    if not WIRE.exists():
        print(f"ERR: schemas dir missing at {WIRE}", file=sys.stderr)
        return 1

    gen_python()
    print("\ndone.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
