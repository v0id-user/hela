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

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
SCHEMAS = ROOT / "packages" / "schemas"
WIRE = SCHEMAS / "wire"
OPENAPI = SCHEMAS / "openapi.yaml"

SDK_PY_GEN = ROOT / "packages" / "sdk-py" / "src" / "hela" / "_generated"
SDK_TS_GEN = ROOT / "packages" / "sdk-types" / "src" / "_generated.ts"
SDK_GO_TYPES = ROOT / "packages" / "sdk-go" / "types.go"
SDK_RS_TYPES = ROOT / "packages" / "sdk-rs" / "src" / "types.rs"

# Pinned via PATH-resolved bunx invocation. quicktype is installed as
# a transient bunx dependency on first run; bun caches it locally so
# subsequent runs are instant.
QUICKTYPE_VERSION = "23.2.6"

# Hand-written Go and Rust types are not regenerated (see plan in
# .cursor/plans/sdk-audit-and-codegen.plan.md for the rationale —
# quicktype's output for those languages drops serde behavior the
# hand-written types depend on). Instead, check_handwritten() walks
# the schemas and confirms each named struct's properties have a
# corresponding language field.
#
# This mapping is intentionally explicit. Schemas whose top-level
# shape isn't a single named struct (presence_state, presence_diff)
# are checked via their nested definitions rather than the top-level.
HANDWRITTEN_DRIFT_MAP: list[tuple[str, str | None, str]] = [
    # (schema file, json-pointer into definitions OR None for root, struct name)
    ("message.schema.json", None, "Message"),
    ("publish_request.schema.json", None, "PublishRequest"),
    ("publish_reply.schema.json", None, "PublishReply"),
    ("history_request.schema.json", None, "HistoryRequest"),
    ("history_reply.schema.json", None, "HistoryReply"),
    ("join_request.schema.json", None, "JoinRequest"),
    ("join_reply.schema.json", None, "JoinReply"),
    ("error.schema.json", None, "ErrorReply"),
    # Meta is the per-connection record nested in presence_state. The
    # SDKs both expose it as PresenceMeta.
    ("presence_state.schema.json", "Meta", "PresenceMeta"),
]


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


def _load_struct_props(schema_file: str, sub_def: str | None) -> set[str]:
    """Read a wire schema and return the property names of one of its
    object definitions. `sub_def` selects a nested `definitions/<name>`
    when None means the root schema."""
    raw = json.loads((WIRE / schema_file).read_text())
    node = raw["definitions"][sub_def] if sub_def else raw
    return set(node.get("properties", {}).keys())


_GO_STRUCT_RE = re.compile(
    r"^type\s+(\w+)\s+struct\s*{([^}]*)}", re.MULTILINE | re.DOTALL
)
_GO_FIELD_TAG_RE = re.compile(r'`json:"([^",]+)')

_RS_STRUCT_RE = re.compile(
    r"pub\s+struct\s+(\w+)\s*{([^}]*)}", re.MULTILINE | re.DOTALL
)
_RS_FIELD_RE = re.compile(r"pub\s+(\w+)\s*:")
_RS_RENAME_RE = re.compile(r'#\[serde\(\s*rename\s*=\s*"([^"]+)"')


def _go_struct_fields(struct_name: str) -> set[str] | None:
    src = SDK_GO_TYPES.read_text()
    for name, body in _GO_STRUCT_RE.findall(src):
        if name == struct_name:
            return set(_GO_FIELD_TAG_RE.findall(body))
    return None


def _rust_struct_fields(struct_name: str) -> set[str] | None:
    src = SDK_RS_TYPES.read_text()
    for name, body in _RS_STRUCT_RE.findall(src):
        if name != struct_name:
            continue
        # rename overrides take precedence; otherwise the field name
        # is the snake-case identifier itself.
        fields = set(_RS_FIELD_RE.findall(body))
        # Strip out any field with an explicit serde(rename = "..."),
        # then re-add the rename target. We detect rename by walking
        # the struct body line-by-line so the rename binds to the
        # NEXT pub field below it.
        lines = body.splitlines()
        i = 0
        while i < len(lines):
            line = lines[i].strip()
            m = _RS_RENAME_RE.search(line)
            if m:
                rename_target = m.group(1)
                # Find the next pub field declaration.
                j = i + 1
                while j < len(lines):
                    fm = _RS_FIELD_RE.search(lines[j])
                    if fm:
                        fields.discard(fm.group(1))
                        fields.add(rename_target)
                        i = j
                        break
                    j += 1
            i += 1
        return fields
    return None


def check_handwritten() -> None:
    """
    Hand-written Go + Rust types are kept in sync with the schemas by
    confirming each named struct has a field for every schema property.
    Names match by snake_case JSON tag (Go) or `pub <ident>:` /
    `#[serde(rename = "...")]` (Rust).

    Reports drift; raises SystemExit on any mismatch. Has no effect on
    a clean tree.
    """
    _banner("hand-written sdk drift check (go + rust)")
    errors: list[str] = []

    for schema_file, sub_def, struct_name in HANDWRITTEN_DRIFT_MAP:
        expected = _load_struct_props(schema_file, sub_def)
        if not expected:
            continue

        for lang, fields_fn, types_path in (
            ("go", _go_struct_fields, SDK_GO_TYPES),
            ("rust", _rust_struct_fields, SDK_RS_TYPES),
        ):
            actual = fields_fn(struct_name)
            if actual is None:
                errors.append(
                    f"  {lang}: struct `{struct_name}` not found in "
                    f"{types_path.relative_to(ROOT)} "
                    f"(schema: {schema_file}{'#' + sub_def if sub_def else ''})"
                )
                continue
            missing = expected - actual
            if missing:
                errors.append(
                    f"  {lang}: `{struct_name}` missing fields {sorted(missing)} "
                    f"(from {schema_file}{'#' + sub_def if sub_def else ''})"
                )

    if errors:
        print("ERR: schema/handwritten drift:")
        for e in errors:
            print(e, file=sys.stderr)
        print(
            "\n  hint: edit packages/sdk-go/types.go and "
            "packages/sdk-rs/src/types.rs to add the missing fields,",
            file=sys.stderr,
        )
        print("        then re-run `make sdk.gen`.", file=sys.stderr)
        raise SystemExit(1)

    n = len(HANDWRITTEN_DRIFT_MAP)
    print(f"  ok: {n} schema/struct pair(s) covered, no drift")


def main() -> int:
    if not WIRE.exists():
        print(f"ERR: schemas dir missing at {WIRE}", file=sys.stderr)
        return 1

    gen_python()
    gen_typescript()
    check_handwritten()
    print("\ndone.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
