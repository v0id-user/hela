import { Link } from "@tanstack/react-router";
import { projects, TIER_PRICE } from "../lib/api";
import { Page, Panel, KV } from "../components/Layout";

export function ProjectList() {
  const ps = projects();
  const total = ps.reduce((a, p) => a + p.price_per_month, 0);

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
        <h1 style={{ fontSize: 22 }}>projects</h1>
        <Link to="/projects/new">
          <button className="cta">[ new project ]</button>
        </Link>
      </div>

      {ps.length === 0 ? (
        <Panel title="no projects yet">
          <div style={{ color: "#888", fontSize: 13 }}>
            ... create one to get an API key and start publishing.
          </div>
        </Panel>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {ps.map((p) => (
            <Panel key={p.id} title={p.name} right={`${p.region} · ${p.tier}`}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr 1fr 1fr",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                <div>
                  <Link to="/projects/$id" params={{ id: p.id }}>
                    <div style={{ fontSize: 14, color: "#e0e0e0" }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: "#666" }}>{p.id}</div>
                  </Link>
                </div>
                <KV k="msgs/mo" v={fmt(p.usage.messages) + " / " + fmt(p.usage.cap_messages)} />
                <KV k="conns" v={p.usage.connections + " / " + p.usage.cap_connections} />
                <KV k="$/mo" v={"$" + TIER_PRICE[p.tier]} />
              </div>
            </Panel>
          ))}

          <div
            style={{
              marginTop: 10,
              padding: "8px 12px",
              background: "#0a0a0a",
              border: "1px solid #333",
              display: "flex",
              justifyContent: "space-between",
              fontSize: 13,
            }}
          >
            <span style={{ color: "#888" }}>total (all projects, this month)</span>
            <span style={{ color: "#c9a76a" }}>${total}</span>
          </div>
        </div>
      )}
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
