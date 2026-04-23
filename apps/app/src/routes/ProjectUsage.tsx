import { useParams, Link } from "@tanstack/react-router";
import { project } from "../lib/api";
import { Page, Panel, KV, Bar } from "../components/Layout";

export function ProjectUsage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const p = project(id);
  if (!p) return null;

  // Fake monthly history for a 12-bar chart. Real impl reads
  // `usage_daily` from the server.
  const months = Array.from({ length: 12 }, (_, i) => {
    const seed = Array.from(p.id).reduce((a, c) => a + c.charCodeAt(0), 0) + i;
    const v = ((seed * 113) % 100) / 100;
    return {
      label: new Date(Date.now() - (11 - i) * 30 * 86400_000)
        .toISOString()
        .slice(0, 7),
      messages: Math.floor(p.usage.cap_messages * v),
    };
  });

  const maxMsg = Math.max(...months.map((m) => m.messages), 1);

  return (
    <Page>
      <div style={{ marginBottom: 14 }}>
        <Link to="/projects/$id" params={{ id }}>
          <span style={{ color: "#888", fontSize: 11 }}>← {p.name}</span>
        </Link>
        <h1 style={{ fontSize: 22, marginTop: 4 }}>usage</h1>
      </div>

      <Panel title="this month" style={{ marginBottom: 12 }}>
        <KV k="messages" v={fmt(p.usage.messages) + " / " + fmt(p.usage.cap_messages)} />
        <Bar value={p.usage.messages} max={p.usage.cap_messages} />
        <div style={{ height: 8 }} />
        <KV k="peak connections" v={p.usage.connections + " / " + p.usage.cap_connections} />
        <Bar value={p.usage.connections} max={p.usage.cap_connections} />
      </Panel>

      <Panel title="messages · last 12 months">
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 140 }}>
          {months.map((m) => (
            <div
              key={m.label}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
              }}
              title={`${m.label}: ${fmt(m.messages)}`}
            >
              <div
                style={{
                  width: "100%",
                  height: `${(m.messages / maxMsg) * 110}px`,
                  background: "#5a5a5a",
                  border: "1px solid #222",
                }}
              />
              <div style={{ fontSize: 9, color: "#666" }}>{m.label.slice(5)}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: "#666" }}>
          values over the tier cap are billed as overage at $0.50 per million.
        </div>
      </Panel>
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
