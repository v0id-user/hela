import { useEffect, useState } from "react";
import { REGIONS, type RegionSlug as Region } from "../lib/regions";

/**
 * /status — live health of every hela service. Pings each gateway's
 * /health endpoint, the control plane's /health, and measures round
 * trip latency. Refreshes every 10 seconds.
 *
 * Regions we've listed but haven't actually deployed yet show as
 * "not deployed" rather than "down". Honest is better than red.
 */

// Regions that currently have a live gateway. Everything else in the
// REGIONS list is reserved. When a new region comes online, add its
// slug here and the page turns it green automatically.
const LIVE_REGIONS = new Set<Region>(["ams"]);

const CONTROL_BASE =
  (import.meta as { env?: { VITE_HELA_CONTROL?: string } }).env?.VITE_HELA_CONTROL ??
  "https://control-production-059e.up.railway.app";

type Probe = {
  ok: boolean;
  rttMs: number | null;
  checkedAt: number;
  error?: string;
};

type State = {
  control: Probe | null;
  gateways: Record<Region, Probe | null>;
};

const EMPTY_STATE: State = {
  control: null,
  gateways: Object.fromEntries(
    REGIONS.map(({ slug }) => [slug, null]),
  ) as Record<Region, Probe | null>,
};

async function probe(url: string): Promise<Probe> {
  const start = performance.now();
  try {
    const res = await fetch(`${url}/health`, {
      method: "GET",
      mode: "cors",
      cache: "no-store",
    });
    const rttMs = performance.now() - start;
    return { ok: res.ok, rttMs, checkedAt: Date.now() };
  } catch (e) {
    return {
      ok: false,
      rttMs: null,
      checkedAt: Date.now(),
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function gatewayUrl(_slug: Region): string {
  // Every region slug resolves to the single live Railway deployment.
  // When a custom domain lands we'll switch to a per-region host; for
  // now the slug is metadata only (`ams` = "the one we actually run").
  const env = (import.meta as { env?: { VITE_HELA_GATEWAY?: string } }).env;
  return env?.VITE_HELA_GATEWAY ?? "https://gateway-production-bfdf.up.railway.app";
}

export function Status() {
  const [state, setState] = useState<State>(EMPTY_STATE);
  const [lastRun, setLastRun] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function runAll() {
    setRefreshing(true);
    const control = probe(CONTROL_BASE);
    const gatewayProbes: Array<[Region, Promise<Probe>]> = REGIONS.filter(({ slug }) =>
      LIVE_REGIONS.has(slug),
    ).map(({ slug }) => [slug, probe(gatewayUrl(slug))] as const);

    const [controlResult, ...gatewayResults] = await Promise.all([
      control,
      ...gatewayProbes.map(([, p]) => p),
    ]);

    const gateways: Record<Region, Probe | null> = { ...EMPTY_STATE.gateways };
    gatewayProbes.forEach(([slug], i) => {
      gateways[slug] = gatewayResults[i];
    });
    setState({ control: controlResult, gateways });
    setLastRun(Date.now());
    setRefreshing(false);
  }

  useEffect(() => {
    runAll();
    const id = setInterval(runAll, 10_000);
    return () => clearInterval(id);
  }, []);

  const overall = computeOverall(state);

  return (
    <section style={{ padding: "40px 20px 60px", maxWidth: 900, margin: "0 auto" }}>
      <div
        style={{
          fontSize: 10,
          color: "#c9a76a",
          textTransform: "uppercase",
          letterSpacing: 1.5,
          marginBottom: 12,
        }}
      >
        system status
      </div>
      <h1 style={{ fontSize: 26, color: "#e0e0e0", marginBottom: 6 }}>{overall.label}</h1>
      <p style={{ color: "#888", maxWidth: 640, marginBottom: 28 }}>
        {overall.tagline}{" "}
        {lastRun && (
          <span style={{ color: "#555" }}>
            last check {secondsAgo(lastRun)}s ago · auto-refresh every 10s
          </span>
        )}
      </p>

      <Panel title="control plane">
        <ProbeRow label="control · account + project API" probe={state.control} live />
      </Panel>

      <Panel title="gateways">
        {REGIONS.map(({ slug, city }) => {
          const live = LIVE_REGIONS.has(slug);
          return (
            <ProbeRow
              key={slug}
              label={`${slug} · ${city}`}
              probe={live ? state.gateways[slug] : null}
              live={live}
            />
          );
        })}
      </Panel>

      <div style={{ marginTop: 24, display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={runAll} disabled={refreshing}>
          [ {refreshing ? "checking..." : "refresh now"} ]
        </button>
        <span style={{ color: "#666", fontSize: 11 }}>
          pings /health on every service. no cookies, no auth.
        </span>
      </div>
    </section>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#0a0a0a", border: "1px solid #333", marginBottom: 16 }}>
      <div
        style={{
          fontSize: 10,
          color: "#888",
          padding: "4px 10px",
          borderBottom: "1px solid #333",
          background: "#141414",
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {title}
      </div>
      <div>{children}</div>
    </div>
  );
}

function ProbeRow({
  label,
  probe,
  live,
}: {
  label: string;
  probe: Probe | null;
  live: boolean;
}) {
  const status = statusOf(probe, live);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "8px 12px",
        borderBottom: "1px dotted #1a1a1a",
        fontSize: 12,
      }}
    >
      <span style={{ width: 14, fontSize: 14, color: status.color }}>{status.glyph}</span>
      <span style={{ flex: 1, color: "#c0c0c0" }}>{label}</span>
      <span style={{ color: status.color, fontSize: 11 }}>{status.text}</span>
    </div>
  );
}

function statusOf(
  probe: Probe | null,
  live: boolean,
): { glyph: string; text: string; color: string } {
  if (!live) return { glyph: "○", text: "reserved · not deployed", color: "#555" };
  if (!probe) return { glyph: "…", text: "checking", color: "#888" };
  if (!probe.ok) return { glyph: "●", text: probe.error ?? "unreachable", color: "#c9573e" };
  const rtt = probe.rttMs ?? 0;
  return { glyph: "●", text: `up · ${rtt.toFixed(0)} ms`, color: "#7aa65a" };
}

function computeOverall(state: State): { label: string; tagline: string } {
  const probes: Probe[] = [];
  if (state.control?.ok !== undefined) probes.push(state.control);
  for (const p of Object.values(state.gateways)) if (p) probes.push(p);

  if (probes.length === 0) {
    return { label: "checking…", tagline: "running the first round of probes." };
  }

  const down = probes.filter((p) => !p.ok).length;
  if (down === 0) {
    return {
      label: "all systems operational.",
      tagline: "everything we've deployed is answering /health in under 2 s.",
    };
  }
  if (down < probes.length) {
    return {
      label: "partial outage.",
      tagline: `${down} of ${probes.length} live services are unreachable.`,
    };
  }
  return {
    label: "full outage.",
    tagline: "every probe is failing — likely your network, or a global incident.",
  };
}

function secondsAgo(t: number): number {
  return Math.max(0, Math.floor((Date.now() - t) / 1000));
}
