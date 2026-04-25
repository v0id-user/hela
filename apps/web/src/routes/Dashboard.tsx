import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Socket } from "phoenix";
import { WS_BASE } from "../lib/config";
import { Panel } from "../components/Panel";

type Snapshot = {
  at_ms: number;
  node: string;
  region: string;
  cluster: string[];
  connections: number;
  rates: { ingest_received: number; batch_persisted: number; reductions: number };
  counters: { ingest_received_total: number; batch_persisted_total: number; channels_open: number };
  pipeline: { queue_depth: number };
  cache: { total: number; by_project: Record<string, number> };
  quota: Record<string, { messages: number; connections: number }>;
  ingest_by_channel: Record<string, number>;
  latency: {
    broadcast: LatencyHist;
    persist: LatencyHist;
  };
  system: {
    processes: number;
    processes_limit: number;
    atoms: number;
    atoms_limit: number;
    ports: number;
    ports_limit: number;
    ets_tables: number;
    memory_mb: number;
    memory_processes_mb: number;
    memory_binary_mb: number;
    memory_ets_mb: number;
    memory_code_mb: number;
    run_queue: number;
    schedulers: number;
    uptime_s: number;
  };
};

type LatencyHist = {
  count: number;
  max_us: number;
  p50_us: number;
  p99_us: number;
  p999_us: number;
  buckets: { le_us: number; count: number }[];
};

type NodeMap = Record<string, Snapshot>;

const HISTORY_LEN = 60;

export function Dashboard() {
  const [byNode, setByNode] = useState<NodeMap>({});
  const [history, setHistory] = useState<{ at: number; in: number; persisted: number }[]>([]);

  const pendingRef = useRef<Map<string, Snapshot>>(new Map());
  const aliveRef = useRef<Set<string>>(new Set());
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const sock = new Socket(`${WS_BASE}/socket`, {
      // Metrics are public on hela. The gateway admits anonymous sockets;
      // `chan:*` joins are still rejected at the channel layer — only
      // `metrics:*` works on an anon socket.
      params: {},
    });

    sock.connect();
    const ch = sock.channel("metrics:live", {});

    const flush = () => {
      rafRef.current = null;
      const incoming = pendingRef.current;
      const alive = aliveRef.current;
      if (incoming.size === 0) return;
      pendingRef.current = new Map();
      aliveRef.current = new Set();

      setByNode((m) => {
        const next: NodeMap = {};
        for (const [n, s] of Object.entries(m)) if (alive.has(n)) next[n] = s;
        for (const [n, s] of incoming) next[n] = s;
        return next;
      });
    };

    const apply = (p: Snapshot) => {
      pendingRef.current.set(p.node, p);
      aliveRef.current = new Set(p.cluster ?? []);
      aliveRef.current.add(p.node);
      if (rafRef.current == null) rafRef.current = requestAnimationFrame(flush);
    };

    ch.on("snapshot", apply);
    ch.on("tick", apply);
    ch.join();

    return () => {
      ch.leave();
      sock.disconnect();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, []);

  const agg = useMemo(() => aggregate(byNode), [byNode]);

  useEffect(() => {
    if (!agg) return;
    setHistory((h) => {
      // Dedupe by at_ms — a poll that re-emits the same window
      // shouldn't produce duplicate history rows.
      if (h.length > 0 && h[h.length - 1].at === agg.at_ms) return h;
      const next = h.length >= HISTORY_LEN ? h.slice(-(HISTORY_LEN - 1)) : h;
      return [...next, { at: agg.at_ms, in: agg.rate_in, persisted: agg.rate_persisted }];
    });
  }, [agg]);

  return (
    <div style={{ padding: 16, maxWidth: 1600, margin: "0 auto" }}>
      <div
        style={{
          fontSize: 11,
          color: "#888",
          padding: "4px 8px",
          borderBottom: "1px solid #333",
          marginBottom: 12,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>/dashboard · live state of the public hela cluster</span>
        <span>
          cluster: {Object.keys(byNode).length} node
          {Object.keys(byNode).length !== 1 ? "s" : ""} · region:{" "}
          {Object.values(byNode)[0]?.region ?? "?"} · uptime:{" "}
          {agg ? fmtDuration(agg.uptime_s) : "-"}
        </span>
      </div>

      <StatGrid>
        <Stat
          label="msgs/sec in"
          value={fmt(agg?.rate_in)}
          tip="messages/sec the cluster is INGESTING (sum across replicas)."
        />
        <Stat
          label="msgs/sec persisted"
          value={fmt(agg?.rate_persisted)}
          tip="rows/sec Broadway is flushing to Postgres. Tracks ingest in steady state."
        />
        <Stat
          label="queue depth"
          value={agg?.queue_depth ?? "-"}
          tip="messages waiting for the batcher. Stays near 0 when persist is keeping up."
        />
        <Stat
          label="ws connections"
          value={agg?.connections ?? "-"}
          tip="live channel processes = live WS clients across the cluster."
        />
        <Stat
          label="cached"
          value={agg?.cache_total ?? "-"}
          tip="ring buffer entries held across all per-node ETS tables."
        />
        <Stat
          label="processes"
          value={agg ? `${agg.processes}` : "-"}
          sub={agg ? `of ${fmt(agg.processes_limit)}` : ""}
          tip="Erlang processes cluster-wide. Each WS ≈ 1 process. Limit is 1M+/node."
        />
        <Stat
          label="memory"
          value={agg ? `${agg.memory_mb.toFixed(0)}mb` : "-"}
          sub={
            agg
              ? `proc ${agg.memory_processes_mb.toFixed(0)} · bin ${agg.memory_binary_mb.toFixed(0)}`
              : ""
          }
          tip="resident BEAM heap cluster-wide."
        />
        <Stat
          label="run queue"
          value={agg?.run_queue ?? "-"}
          tip="processes waiting for a scheduler. sustained >0 = CPU-bound."
        />
      </StatGrid>

      <div style={{ height: 1 }} />

      <StatGrid>
        <Stat
          label="atoms"
          value={agg ? fmt(agg.atoms) : "-"}
          sub={agg ? `of ${fmt(agg.atoms_limit)}` : ""}
          tip="atom table size. Atoms are never GC'd — should stay flat."
        />
        <Stat
          label="ports"
          value={agg ? `${agg.ports}` : "-"}
          sub={agg ? `of ${fmt(agg.ports_limit)}` : ""}
          tip="open ports cluster-wide."
        />
        <Stat
          label="ets tables"
          value={agg ? `${agg.ets_tables}` : "-"}
          sub={agg ? `${agg.memory_ets_mb.toFixed(1)}mb` : ""}
          tip="ETS table count + total ETS memory."
        />
        <Stat
          label="binary mem"
          value={agg ? `${agg.memory_binary_mb.toFixed(1)}mb` : "-"}
          tip="reference-counted binary heap."
        />
        <Stat
          label="code mem"
          value={agg ? `${agg.memory_code_mb.toFixed(1)}mb` : "-"}
          tip="loaded BEAM bytecode."
        />
        <Stat
          label="schedulers"
          value={agg ? `${agg.schedulers}` : "-"}
          tip="normal schedulers online per node."
        />
        <Stat
          label="channels open"
          value={fmt(agg?.channels_open)}
          tip="active channel processes (per-node sum)."
        />
        <Stat
          label="total msgs"
          value={fmt(agg?.ingest_total)}
          tip="cumulative messages ingested since last reset."
        />
      </StatGrid>

      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
        <Panel title="throughput [60s]">
          <Chart history={history} />
        </Panel>
        <Panel title={`nodes [${Object.keys(byNode).length}]`}>
          <NodeTable byNode={byNode} />
        </Panel>
      </div>

      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Panel title="latency: ingest → broadcast">
          <LatencyPanel byNode={byNode} kind="broadcast" />
        </Panel>
        <Panel title="latency: ingest → persisted">
          <LatencyPanel byNode={byNode} kind="persist" />
        </Panel>
      </div>

      <div style={{ marginTop: 12 }}>
        <Panel title="ingest heatmap · node × (project/channel)">
          <IngestHeatmap byNode={byNode} />
        </Panel>
      </div>

      <div
        style={{
          marginTop: 16,
          padding: "10px 12px",
          background: "#1a1613",
          border: "1px solid #2a221a",
          color: "#c9a76a",
          fontSize: 12,
        }}
      >
        &gt; this dashboard is the same shape customers get for their own project on the app — just
        scoped to one project instead of the whole cluster.
      </div>
    </div>
  );
}

function StatGrid({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        gap: 1,
        background: "#333",
        border: "1px solid #333",
      }}
    >
      {children}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tip,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  tip?: string;
}) {
  return (
    <div style={{ background: "#0a0a0a", padding: "6px 10px", minHeight: 56 }} title={tip}>
      <div
        style={{
          fontSize: 9,
          color: "#666",
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 16, color: "#e0e0e0", marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: "#555", marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

const NodeTable = memo(function NodeTable({ byNode }: { byNode: NodeMap }) {
  const nodes = Object.entries(byNode).sort();
  if (nodes.length === 0) return <div style={{ color: "#555", fontSize: 11 }}>... waiting</div>;

  return (
    <div style={{ fontSize: 11 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr",
          color: "#666",
          fontSize: 10,
          padding: "2px 0",
          borderBottom: "1px solid #222",
          textTransform: "uppercase",
        }}
      >
        <span>node</span>
        <span style={{ textAlign: "right" }}>msgs/s</span>
        <span style={{ textAlign: "right" }}>procs</span>
        <span style={{ textAlign: "right" }}>mem</span>
        <span style={{ textAlign: "right" }}>region</span>
      </div>
      {nodes.map(([name, s]) => (
        <div
          key={name}
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr",
            padding: "3px 0",
            borderBottom: "1px dotted #1a1a1a",
          }}
        >
          <span
            style={{
              color: "#c0c0c0",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {shortNode(name)}
          </span>
          <span style={{ textAlign: "right", color: "#a0a0a0" }}>
            {fmt(s.rates?.ingest_received)}
          </span>
          <span style={{ textAlign: "right", color: "#a0a0a0" }}>{s.system?.processes ?? 0}</span>
          <span style={{ textAlign: "right", color: "#a0a0a0" }}>
            {s.system?.memory_mb?.toFixed(0) ?? 0}mb
          </span>
          <span style={{ textAlign: "right", color: "#c9a76a" }}>{s.region}</span>
        </div>
      ))}
    </div>
  );
});

function Chart({ history }: { history: { at: number; in: number; persisted: number }[] }) {
  const w = 600;
  const h = 180;
  if (history.length < 2)
    return <div style={{ color: "#555", fontSize: 12 }}>... gathering data</div>;

  const max = Math.max(1, ...history.flatMap((p) => [p.in, p.persisted]));
  const series = [
    { key: "in" as const, color: "#c0c0c0", label: "msgs/s in" },
    { key: "persisted" as const, color: "#707070", label: "msgs/s persisted" },
  ];

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      <rect x={0} y={0} width={w} height={h} fill="none" stroke="#222" />
      {[0.25, 0.5, 0.75].map((p) => (
        <line key={p} x1={0} x2={w} y1={h * p} y2={h * p} stroke="#1a1a1a" strokeDasharray="2,3" />
      ))}
      {series.map((s) => {
        const pts = history.map((snap, i) => {
          const v = snap[s.key] || 0;
          const x = (i / (history.length - 1)) * w;
          const y = h - (v / max) * h;
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        });
        return (
          <polyline
            key={s.key}
            fill="none"
            stroke={s.color}
            strokeWidth={1}
            points={pts.join(" ")}
          />
        );
      })}
      {series.map((s, i) => (
        <text key={s.key} x={8} y={14 + i * 12} fill={s.color} fontSize={10}>
          {s.label}
        </text>
      ))}
      <text x={w - 8} y={12} textAnchor="end" fill="#555" fontSize={10}>
        max {max.toFixed(0)}/s
      </text>
    </svg>
  );
}

function LatencyPanel({ byNode, kind }: { byNode: NodeMap; kind: "broadcast" | "persist" }) {
  const nodes = Object.values(byNode);
  if (nodes.length === 0) return <div style={{ color: "#555", fontSize: 11 }}>... waiting</div>;

  const bucketMap = new Map<number, number>();
  let count = 0,
    maxUs = 0,
    p50 = 0,
    p99 = 0,
    p999 = 0,
    n = 0;

  for (const s of nodes) {
    const h = s.latency?.[kind];
    if (!h) continue;
    count += h.count;
    maxUs = Math.max(maxUs, h.max_us);
    p50 += h.p50_us;
    p99 += h.p99_us;
    p999 += h.p999_us;
    n += 1;
    for (const b of h.buckets) bucketMap.set(b.le_us, (bucketMap.get(b.le_us) || 0) + b.count);
  }

  p50 = n > 0 ? p50 / n : 0;
  p99 = n > 0 ? p99 / n : 0;
  p999 = n > 0 ? p999 / n : 0;

  const buckets = Array.from(bucketMap.entries()).sort((a, b) => a[0] - b[0]);
  const maxCount = Math.max(1, ...buckets.map(([, c]) => c));

  return (
    <div style={{ fontSize: 11 }}>
      <div style={{ display: "flex", gap: 12, marginBottom: 8, color: "#888" }}>
        <span>p50 {fmtUs(p50)}</span>
        <span>p99 {fmtUs(p99)}</span>
        <span>p999 {fmtUs(p999)}</span>
        <span>max {fmtUs(maxUs)}</span>
        <span style={{ marginLeft: "auto" }}>n {fmt(count)}</span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 1, height: 80 }}>
        {buckets.map(([edge, c]) => {
          const h = c === 0 ? 1 : Math.max(1, (c / maxCount) * 80);
          return (
            <div
              key={edge}
              title={`≤${fmtUs(edge)}: ${c}`}
              style={{
                flex: 1,
                height: h,
                background: c === 0 ? "#1a1a1a" : "#5a5a5a",
                border: "1px solid #222",
              }}
            />
          );
        })}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 2,
          color: "#555",
          fontSize: 9,
        }}
      >
        <span>{fmtUs(buckets[0]?.[0] ?? 0)}</span>
        <span>{fmtUs(buckets[buckets.length - 1]?.[0] ?? 0)}</span>
      </div>
    </div>
  );
}

function IngestHeatmap({ byNode }: { byNode: NodeMap }) {
  const nodes = Object.entries(byNode).sort();
  if (nodes.length === 0) return <div style={{ color: "#555", fontSize: 11 }}>... waiting</div>;

  const keys = new Set<string>();
  for (const [, s] of nodes) Object.keys(s.ingest_by_channel || {}).forEach((k) => keys.add(k));
  const channels = [...keys].sort();

  if (channels.length === 0)
    return (
      <div style={{ color: "#555", fontSize: 11 }}>
        ... no ingest yet. publish something from the home page to see cells light up.
      </div>
    );

  let max = 0;
  for (const [, s] of nodes)
    for (const v of Object.values(s.ingest_by_channel || {})) if (v > max) max = v;
  max = Math.max(1, max);

  return (
    <div style={{ overflow: "auto", fontSize: 10 }}>
      <table style={{ borderCollapse: "collapse", fontSize: 10 }}>
        <thead>
          <tr>
            <th
              style={{
                textAlign: "left",
                color: "#666",
                padding: "2px 6px",
                borderBottom: "1px solid #222",
              }}
            >
              node
            </th>
            {channels.map((g) => (
              <th
                key={g}
                style={{
                  color: "#888",
                  padding: "2px 6px",
                  borderBottom: "1px solid #222",
                  minWidth: 70,
                  fontWeight: "normal",
                }}
              >
                {g}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {nodes.map(([name, s]) => (
            <tr key={name}>
              <td
                style={{
                  color: "#888",
                  padding: "2px 6px",
                  borderRight: "1px solid #222",
                  whiteSpace: "nowrap",
                }}
              >
                {shortNode(name)}
              </td>
              {channels.map((g) => {
                const v = s.ingest_by_channel?.[g] || 0;
                const pct = v / max;
                const lightness = 6 + Math.round(pct * 22);
                const saturation = Math.round(pct * 45);
                const bg = v === 0 ? "#0f0f0f" : `hsl(120, ${saturation}%, ${lightness}%)`;
                return (
                  <td
                    key={g}
                    title={`${name} · ${g}: ${v}`}
                    style={{
                      background: bg,
                      color: v === 0 ? "#333" : "#d8d8d8",
                      padding: "4px 6px",
                      textAlign: "center",
                      border: "1px solid #1a1a1a",
                      minWidth: 70,
                    }}
                  >
                    {fmt(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --- helpers ---------------------------------------------------------

function shortNode(n: string): string {
  const parts = n.split(/[@:]/);
  const tail = parts[parts.length - 1];
  return tail.length > 12 ? "…" + tail.slice(-12) : n;
}

function fmt(n: number | undefined | null): string {
  if (n == null) return "-";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}b`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(1);
}

function fmtUs(us: number): string {
  if (us < 1000) return `${us.toFixed(0)}µs`;
  if (us < 1_000_000) return `${(us / 1000).toFixed(1)}ms`;
  return `${(us / 1_000_000).toFixed(2)}s`;
}

function fmtDuration(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

function aggregate(byNode: NodeMap) {
  const nodes = Object.values(byNode);
  if (nodes.length === 0) return null;

  const sum = (f: (s: Snapshot) => number) => nodes.reduce((a, s) => a + (f(s) || 0), 0);
  const max = (f: (s: Snapshot) => number) => nodes.reduce((a, s) => Math.max(a, f(s) || 0), 0);

  const last = nodes.reduce((a, s) => (s.at_ms > a.at_ms ? s : a), nodes[0]);

  return {
    at_ms: last.at_ms,
    rate_in: sum((s) => s.rates?.ingest_received || 0),
    rate_persisted: sum((s) => s.rates?.batch_persisted || 0),
    queue_depth: sum((s) => s.pipeline?.queue_depth || 0),
    connections: sum((s) => s.connections || 0),
    cache_total: sum((s) => s.cache?.total || 0),
    processes: sum((s) => s.system?.processes || 0),
    processes_limit: max((s) => s.system?.processes_limit || 0),
    atoms: max((s) => s.system?.atoms || 0),
    atoms_limit: max((s) => s.system?.atoms_limit || 0),
    ports: sum((s) => s.system?.ports || 0),
    ports_limit: max((s) => s.system?.ports_limit || 0),
    ets_tables: sum((s) => s.system?.ets_tables || 0),
    memory_mb: sum((s) => s.system?.memory_mb || 0),
    memory_processes_mb: sum((s) => s.system?.memory_processes_mb || 0),
    memory_binary_mb: sum((s) => s.system?.memory_binary_mb || 0),
    memory_ets_mb: sum((s) => s.system?.memory_ets_mb || 0),
    memory_code_mb: sum((s) => s.system?.memory_code_mb || 0),
    schedulers: max((s) => s.system?.schedulers || 0),
    run_queue: sum((s) => s.system?.run_queue || 0),
    uptime_s: max((s) => s.system?.uptime_s || 0),
    channels_open: sum((s) => s.counters?.channels_open || 0),
    ingest_total: sum((s) => s.counters?.ingest_received_total || 0),
  };
}
