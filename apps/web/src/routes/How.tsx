import { Panel, SectionHeading } from "../components/Panel";

export function How() {
  return (
    <div style={{ padding: "32px 20px 80px", maxWidth: 1100, margin: "0 auto" }}>
      <SectionHeading
        eyebrow="architecture"
        title="how hela works"
        sub="short version: BEAM does the hard parts. the rest is boring. this page explains the hot path, the cluster topology, the multi-region story, and what we deliberately don't do."
      />

      {/* --- hot path ------------------------------------------------ */}
      <Panel title="1. the hot path · one message end to end" style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, color: "#c0c0c0", marginBottom: 12 }}>
          every inbound publish hits this pipeline. everything is bounded, nothing
          on the path waits on Postgres.
        </div>
        <HotPathDiagram />
        <div style={{ fontSize: 12, color: "#888", marginTop: 12, lineHeight: 1.7 }}>
          <ol style={{ paddingLeft: 18, margin: 0 }}>
            <li><b>UUIDv7</b> is minted at ingest. Same id in cache, wire frame, Postgres row, and reply pointers. Cursor pagination is just <code>id &lt; ?</code>.</li>
            <li><b>Quota check</b> — per-project counter in ETS. Admit or flag over_quota for metered billing.</li>
            <li><b>ETS ring buffer</b> — per (project, channel). Sub-microsecond recent-history reads.</li>
            <li><b>Phoenix.PubSub broadcast</b> — cluster-wide. Subscribers on any node in the region receive.</li>
            <li><b>Cache sync broadcast</b> — every peer node mirrors the row into its own ETS so a reload that lands on a different replica sees the message immediately, before the DB write lands.</li>
            <li><b>Broadway batcher</b> — accumulates up to 1000 rows or 200ms, then one <code>Repo.insert_all</code>.</li>
            <li><b>Telemetry counters</b> — the metrics sampler reads these 3Hz and broadcasts a snapshot for the live dashboard.</li>
          </ol>
        </div>
      </Panel>

      {/* --- cluster topology --------------------------------------- */}
      <Panel title="2. cluster topology · within a region" style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, color: "#c0c0c0", marginBottom: 12 }}>
          inside a region, hela nodes mesh automatically over IPv6 via{" "}
          <code>dns_cluster</code>. no Redis, no external coordinator. adding a
          replica is a container start.
        </div>
        <TopologyDiagram />
        <div style={{ fontSize: 12, color: "#888", marginTop: 12, lineHeight: 1.7 }}>
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            <li><b>Phoenix.PubSub</b> broadcasts over the mesh. A publish on node A reaches subscribers on B, C, D transparently.</li>
            <li><b>Phoenix.Presence</b> is CRDT-replicated across the mesh. Join/leave events merge without conflicts.</li>
            <li><b>ETS ring</b> is per-node. On a miss, we fall through to Postgres (shared regional DB).</li>
            <li><b>Node loss</b>: the cluster detects a departure in ~2s, shrinks PubSub routing, re-meshes on the next DNS tick. Channel processes on the downed node die; their subscribers reconnect via the load balancer to surviving replicas.</li>
          </ul>
        </div>
      </Panel>

      {/* --- multi-region ------------------------------------------- */}
      <Panel title="3. multi-region · opt-in cross-region relay" style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, color: "#c0c0c0", marginBottom: 12 }}>
          most projects live in one region and never need cross-region traffic.
          Scale and Enterprise tiers can opt in — we spin up a small relay
          process that forwards a project's channel traffic to peer regions.
        </div>
        <MultiRegionDiagram />
        <div style={{ fontSize: 12, color: "#888", marginTop: 12, lineHeight: 1.7 }}>
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            <li>regional clusters are otherwise <b>isolated BEAM clusters</b>. We don't run one big WAN-stretched mesh — that doesn't scale.</li>
            <li>the relay is a one-way forwarder per (project, region-pair). It speaks Phoenix.Channel over WS, same as any SDK client, and publishes into the peer region's PubSub.</li>
            <li>UUIDv7 ids sort globally, so multi-region history stays in time order without a coordinator. duplicates are rare (a publish only enters the relay from its origin region) and deduplicated in the receiving cache's <code>insert_new</code>.</li>
          </ul>
        </div>
      </Panel>

      {/* --- why BEAM ---------------------------------------------- */}
      <Panel title="4. why BEAM" style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: "#c0c0c0", lineHeight: 1.8 }}>
          <p style={{ marginBottom: 10 }}>
            we picked BEAM because the product is a shape the runtime is already the answer to:
          </p>
          <Grid2>
            <Bullet title="lightweight processes">
              one process per WebSocket. 500k conns is 500k processes with ~2KB
              heap each. garbage-collected per-process, so one slow client doesn't
              drag everyone else's latency.
            </Bullet>
            <Bullet title="preemptive scheduling">
              the BEAM scheduler interrupts any process every ~2000 reductions.
              no thread pool starvation from a single stuck handler.
            </Bullet>
            <Bullet title="message-passing, not shared memory">
              channels publish to subscribers by sending. we never have to reason
              about locks or visibility across cores.
            </Bullet>
            <Bullet title="built-in distribution">
              <code>Node.list()</code> and <code>Phoenix.PubSub</code> give us a
              cluster for free. no Redis, no Zookeeper, no operational footprint
              we didn't want.
            </Bullet>
            <Bullet title="ETS">
              in-process, concurrent-read, ordered-set tables. our per-channel
              ring buffer is one. sub-microsecond reads from any process.
            </Bullet>
            <Bullet title="OTP supervision">
              a channel process crashing doesn't take down the node, the cluster,
              or even the user's session — supervisors restart it with an empty
              mailbox.
            </Bullet>
          </Grid2>
        </div>
      </Panel>

      {/* --- non-goals --------------------------------------------- */}
      <Panel title="5. what we deliberately don't do">
        <div style={{ fontSize: 12, color: "#c0c0c0", lineHeight: 1.8 }}>
          <Grid2>
            <Bullet title="edge everywhere">
              no 300-city edge network. five regions is enough to put 95% of
              internet users under 100ms, and our model breaks down when a session
              is sharded across too many POPs. Cloudflare Durable Objects is the
              right tool if you need that; hela is not.
            </Bullet>
            <Bullet title="scale to zero">
              we keep at least two replicas hot per region, always. cold-start a
              WebSocket backend is not a good customer experience.
            </Bullet>
            <Bullet title="per-message billing">
              metered billing creates adversarial incentives between us and you.
              flat tier caps + overage only for the top 1% makes both sides
              predictable.
            </Bullet>
            <Bullet title="custom protocols">
              Phoenix.Channel is the wire. If you want MQTT or raw TCP, use
              something else.
            </Bullet>
          </Grid2>
        </div>
      </Panel>
    </div>
  );
}

// --- diagrams ---------------------------------------------------------

function HotPathDiagram() {
  return (
    <svg viewBox="0 0 1100 260" width="100%" style={{ display: "block" }}>
      <defs>
        <marker
          id="arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto"
        >
          <path d="M0,0 L10,5 L0,10 z" fill="#888" />
        </marker>
      </defs>

      {node(20, 90, "client", "publish(body)")}
      {node(210, 90, "Hela.Channels", "validate · mint UUIDv7")}
      {node(420, 40, "Quota", "ETS bump")}
      {node(420, 140, "ETS ring", "insert_new")}
      {node(640, 40, "PubSub", "region broadcast")}
      {node(640, 140, "cache:sync", "peer ETS mirror")}
      {node(860, 40, "subscribers", "push(msg)")}
      {node(860, 140, "Broadway", "batch 1000 / 200ms")}
      {node(860, 220, "Postgres", "insert_all")}

      {arrow(180, 115, 210, 115)}
      {arrow(390, 105, 420, 65)}
      {arrow(390, 125, 420, 165)}
      {arrow(600, 65, 640, 65)}
      {arrow(600, 165, 640, 165)}
      {arrow(820, 65, 860, 65)}
      {arrow(820, 165, 860, 165)}
      {arrow(920, 200, 920, 220)}

      <text x={20} y={250} fill="#666" fontSize="11">
        every arrow is a non-blocking message-send. nothing on the hot path waits.
      </text>
    </svg>
  );
}

function TopologyDiagram() {
  return (
    <svg viewBox="0 0 1100 320" width="100%" style={{ display: "block" }}>
      <rect x={20} y={20} width={1060} height={280} fill="none" stroke="#333" strokeDasharray="4 4" />
      <text x={32} y={40} fill="#888" fontSize="11">
        region: iad · dns_cluster mesh over IPv6
      </text>

      {nodeLabeled(60, 90, "node A", "WS · ETS · PubSub")}
      {nodeLabeled(330, 90, "node B", "WS · ETS · PubSub")}
      {nodeLabeled(600, 90, "node C", "WS · ETS · PubSub")}
      {nodeLabeled(870, 90, "node D", "WS · ETS · PubSub")}

      {/* full mesh edges */}
      {meshEdge(60 + 120, 90 + 40, 330, 90 + 40)}
      {meshEdge(330 + 120, 90 + 40, 600, 90 + 40)}
      {meshEdge(600 + 120, 90 + 40, 870, 90 + 40)}
      {meshEdge(60 + 60, 90 + 80, 600 + 60, 90 + 80, true)}
      {meshEdge(60 + 60, 90 + 80, 870 + 60, 90 + 80, true)}
      {meshEdge(330 + 60, 90 + 80, 870 + 60, 90 + 80, true)}

      {/* shared pg */}
      {node(440, 230, "Postgres (regional)", "cold tier · message history")}

      {arrow(120, 170, 480, 230)}
      {arrow(390, 170, 510, 230)}
      {arrow(660, 170, 540, 230)}
      {arrow(930, 170, 570, 230)}
    </svg>
  );
}

function MultiRegionDiagram() {
  return (
    <svg viewBox="0 0 1100 280" width="100%" style={{ display: "block" }}>
      {regionBox(20, 40, "iad · US East", "node A · node B")}
      {regionBox(420, 40, "fra · EU", "node A · node B")}
      {regionBox(820, 40, "sin · Asia", "node A · node B")}

      {relay(260, 130, "relay")}
      {relay(660, 130, "relay")}

      {arrow(190, 100, 260, 130)}
      {arrow(320, 130, 420, 100)}
      {arrow(590, 100, 660, 130)}
      {arrow(720, 130, 820, 100)}

      <text x={40} y={220} fill="#666" fontSize="11">
        each region's BEAM cluster is independent. one-way per-project relay
        forwards published messages across regions. opt-in on Scale+.
      </text>
    </svg>
  );
}

// --- SVG helpers ------------------------------------------------------

function node(x: number, y: number, title: string, sub: string) {
  return (
    <g key={title + x}>
      <rect x={x} y={y} width={170} height={50} fill="#0d0d0d" stroke="#333" />
      <text x={x + 10} y={y + 20} fill="#e0e0e0" fontSize="13">{title}</text>
      <text x={x + 10} y={y + 38} fill="#888" fontSize="11">{sub}</text>
    </g>
  );
}

function nodeLabeled(x: number, y: number, title: string, sub: string) {
  return (
    <g key={title + x}>
      <rect x={x} y={y} width={120} height={80} fill="#0d0d0d" stroke="#c9a76a" />
      <text x={x + 10} y={y + 22} fill="#c9a76a" fontSize="12">{title}</text>
      <text x={x + 10} y={y + 42} fill="#c0c0c0" fontSize="10">WS</text>
      <text x={x + 10} y={y + 56} fill="#c0c0c0" fontSize="10">ETS ring</text>
      <text x={x + 10} y={y + 70} fill="#c0c0c0" fontSize="10">PubSub</text>
    </g>
  );
}

function regionBox(x: number, y: number, title: string, sub: string) {
  return (
    <g key={title}>
      <rect x={x} y={y} width={170} height={100} fill="#0d0d0d" stroke="#333" />
      <text x={x + 10} y={y + 22} fill="#c9a76a" fontSize="12">{title}</text>
      <text x={x + 10} y={y + 42} fill="#c0c0c0" fontSize="11">{sub}</text>
      <text x={x + 10} y={y + 72} fill="#666" fontSize="10">dns_cluster mesh</text>
      <text x={x + 10} y={y + 86} fill="#666" fontSize="10">shared Postgres</text>
    </g>
  );
}

function relay(x: number, y: number, label: string) {
  return (
    <g>
      <rect x={x} y={y} width={60} height={30} fill="#1a1613" stroke="#c9a76a" />
      <text x={x + 10} y={y + 20} fill="#c9a76a" fontSize="11">{label}</text>
    </g>
  );
}

function arrow(x1: number, y1: number, x2: number, y2: number) {
  return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#888" strokeWidth={1} markerEnd="url(#arrow)" />;
}

function meshEdge(x1: number, y1: number, x2: number, y2: number, dashed = false) {
  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke="#444"
      strokeDasharray={dashed ? "3 3" : undefined}
    />
  );
}

// --- text helpers -----------------------------------------------------

function Grid2({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      {children}
    </div>
  );
}

function Bullet({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          color: "#c9a76a",
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginBottom: 2,
        }}
      >
        {title}
      </div>
      <div>{children}</div>
    </div>
  );
}
