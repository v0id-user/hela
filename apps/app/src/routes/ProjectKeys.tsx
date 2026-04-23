import { useState } from "react";
import { useParams, Link } from "@tanstack/react-router";
import { project, rotateKey } from "../lib/api";
import { Page, Panel } from "../components/Layout";

export function ProjectKeys() {
  const { id } = useParams({ strict: false }) as { id: string };
  const p = project(id);
  const [lastNew, setLastNew] = useState<{ prefix: string; secret: string } | null>(null);

  if (!p) return null;

  function rotate() {
    const { prefix, secret } = rotateKey(id);
    setLastNew({ prefix, secret });
  }

  return (
    <Page>
      <div style={{ marginBottom: 14 }}>
        <Link to="/projects/$id" params={{ id }}>
          <span style={{ color: "#888", fontSize: 11 }}>← {p.name}</span>
        </Link>
        <h1 style={{ fontSize: 22, marginTop: 4 }}>api keys</h1>
      </div>

      <Panel title="keys · this project" right={`${p.keys.length} active`} style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: "#888", marginBottom: 10 }}>
          API keys are used by your backend to issue JWTs via{" "}
          <code>POST /v1/tokens</code> (or to call REST publish endpoints).
          keep them out of the browser. we only ever show the full secret
          once, at creation.
        </div>
        <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ color: "#666", borderBottom: "1px solid #222" }}>
              <th style={{ textAlign: "left", padding: "4px 8px" }}>prefix</th>
              <th style={{ textAlign: "left", padding: "4px 8px" }}>label</th>
              <th style={{ textAlign: "left", padding: "4px 8px" }}>last used</th>
            </tr>
          </thead>
          <tbody>
            {p.keys.map((k) => (
              <tr key={k.prefix} style={{ borderBottom: "1px dotted #1a1a1a" }}>
                <td style={{ padding: "4px 8px", color: "#c9a76a" }}>
                  hk_{k.prefix}_<span style={{ color: "#666" }}>•••</span>
                </td>
                <td style={{ padding: "4px 8px" }}>{k.label ?? "—"}</td>
                <td style={{ padding: "4px 8px", color: "#888" }}>
                  {k.last_used_at ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 12 }}>
          <button onClick={rotate}>[ rotate ]</button>
        </div>
      </Panel>

      {lastNew && (
        <Panel title="new key · copy now" style={{ borderColor: "#c9a76a" }}>
          <div style={{ fontSize: 12, color: "#c9a76a", marginBottom: 10 }}>
            this is the only time we'll show the full secret. paste it into
            your backend's env var right now.
          </div>
          <pre
            style={{
              background: "#0d0d0d",
              border: "1px solid #c9a76a",
              padding: 10,
              fontSize: 12,
              margin: 0,
              userSelect: "all",
            }}
          >
            hk_{lastNew.prefix}_{lastNew.secret}
          </pre>
        </Panel>
      )}
    </Page>
  );
}
