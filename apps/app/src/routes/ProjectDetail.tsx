import { useParams, Link } from "@tanstack/react-router";
import { project, updateProject, deleteProject } from "../lib/api";
import { Page, Panel, KV, Bar } from "../components/Layout";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";

export function ProjectDetail() {
  const { id } = useParams({ strict: false }) as { id: string };
  const p = project(id);
  const [jwkInput, setJwkInput] = useState("");
  const navigate = useNavigate();

  if (!p)
    return (
      <Page>
        <Panel title="not found">
          <span style={{ color: "#888" }}>no project with id {id}</span>
        </Panel>
      </Page>
    );

  // At this point `p` is non-null; alias it so the nested closures below
  // don't lose the narrowing through re-render boundaries.
  const project_ = p;

  function saveJwk() {
    try {
      const parsed = JSON.parse(jwkInput);
      updateProject(project_.id, { jwt_registered: true });
      setJwkInput("");
      alert(`> registered public key (${parsed.kty || "unknown kty"})`);
    } catch {
      alert("> not valid JSON");
    }
  }

  function deleteMe() {
    if (confirm(`delete ${project_.name}? this cancels its Stripe subscription.`)) {
      deleteProject(project_.id);
      navigate({ to: "/" });
    }
  }

  return (
    <Page>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 14,
          alignItems: "baseline",
        }}
      >
        <div>
          <h1 style={{ fontSize: 22 }}>{p.name}</h1>
          <div style={{ fontSize: 12, color: "#666" }}>
            {p.id} · region {p.region} · tier {p.tier} · since {p.created_at.slice(0, 10)}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <Link to="/projects/$id/keys" params={{ id: p.id }}>
            <button>[ keys ]</button>
          </Link>
          <Link to="/projects/$id/usage" params={{ id: p.id }}>
            <button>[ usage ]</button>
          </Link>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Panel title="live">
          <KV k="connections" v={p.usage.connections + " / " + p.usage.cap_connections} />
          <Bar value={p.usage.connections} max={p.usage.cap_connections} />
          <div style={{ height: 10 }} />
          <KV
            k="messages this month"
            v={fmt(p.usage.messages) + " / " + fmt(p.usage.cap_messages)}
          />
          <Bar value={p.usage.messages} max={p.usage.cap_messages} />
        </Panel>

        <Panel title="configuration">
          <KV k="region" v={p.region} />
          <KV k="tier" v={p.tier} />
          <KV k="api keys" v={p.keys.length + " active"} />
          <KV
            k="jwt public key"
            v={p.jwt_registered ? "registered" : <span style={{ color: "#c9a76a" }}>not set</span>}
          />
          <KV
            k="multi-region"
            v={p.tier === "scale" || p.tier === "ent" ? "eligible" : "upgrade to enable"}
          />
        </Panel>
      </div>

      <div style={{ marginTop: 12 }}>
        <Panel title="jwt public key · register">
          <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>
            paste the JWK (public half) your backend signs grants with. we use this to verify tokens
            on every channel join.
          </div>
          <textarea
            value={jwkInput}
            onChange={(e) => setJwkInput(e.target.value)}
            rows={8}
            style={{ width: "100%", fontFamily: "inherit", fontSize: 12 }}
            placeholder='{ "kty": "RSA", "n": "...", "e": "AQAB", "alg": "RS256", "kid": "main" }'
          />
          <div style={{ marginTop: 8 }}>
            <button onClick={saveJwk} disabled={!jwkInput.trim()}>
              [ register ]
            </button>
          </div>
        </Panel>
      </div>

      <div style={{ marginTop: 20 }}>
        <Panel title="danger zone" right="irreversible">
          <button onClick={deleteMe}>[ delete project ]</button>
        </Panel>
      </div>
    </Page>
  );
}

function fmt(n: number): string {
  if (n === Number.POSITIVE_INFINITY) return "∞";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}b`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}k`;
  return String(n);
}
