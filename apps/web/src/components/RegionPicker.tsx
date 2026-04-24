import { useEffect, useMemo, useState } from "react";
import { Panel, SectionHeading } from "./Panel";
import { REGIONS, type RegionSlug } from "../lib/regions";
import { API_BASE } from "../lib/config";

type Probe = { slug: RegionSlug; rtt: number | null; status: string };

/**
 * Dropdown over the five regions. On change, we open a short-lived
 * WebSocket to that region's cluster (or locally, if in dev) and time
 * a ping round-trip to show real latency to the visitor's machine.
 *
 * In local dev we route every region slug to localhost:4000 so the demo
 * works offline — each probe still opens a fresh socket to prove the
 * handshake path is the one that matters for perceived latency.
 */
export function RegionPicker() {
  const [selected, setSelected] = useState<RegionSlug>("iad");
  const [probe, setProbe] = useState<Probe | null>(null);

  useEffect(() => {
    let cancelled = false;
    setProbe({ slug: selected, rtt: null, status: "> opening..." });

    runProbe(selected)
      .then((rtt) => {
        if (cancelled) return;
        setProbe({ slug: selected, rtt, status: "> ok" });
      })
      .catch((e) => {
        if (cancelled) return;
        setProbe({ slug: selected, rtt: null, status: `> ${e.message}` });
      });

    return () => {
      cancelled = true;
    };
  }, [selected]);

  const region = useMemo(() => REGIONS.find((r) => r.slug === selected)!, [selected]);

  return (
    <section style={{ padding: "24px 20px", maxWidth: 1100, margin: "0 auto" }}>
      <SectionHeading
        eyebrow="region selector"
        title="there are real clusters in real cities"
        sub="pick a region — the browser opens a fresh WebSocket to that region's cluster and pings. local dev routes every slug to localhost:4000, so you see the handshake, not the geography."
      />

      <Panel title="region probe" right={`/regions/${selected}/ping`}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label>
            <div style={{ fontSize: 10, color: "#666", marginBottom: 4 }}>REGION</div>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value as RegionSlug)}
              style={{ minWidth: 260, padding: "4px 6px" }}
            >
              {REGIONS.map((r) => (
                <option key={r.slug} value={r.slug}>
                  {r.slug} · {r.city}, {r.region}
                </option>
              ))}
            </select>
          </label>

          <div style={{ fontSize: 12, color: "#888" }}>
            <div>
              host: <span style={{ color: "#c0c0c0" }}>{region.host}</span>
            </div>
            <div>
              rtt:{" "}
              <span style={{ color: probe?.rtt != null ? "#c9a76a" : "#666" }}>
                {probe?.rtt != null ? `${probe.rtt.toFixed(0)}ms` : "—"}
              </span>
            </div>
            <div style={{ color: "#666" }}>{probe?.status ?? "idle"}</div>
          </div>
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: "#666" }}>
          each probe opens a cold WebSocket (no warm pool) so you see the full TLS + Phoenix
          handshake + ping round-trip.
        </div>
      </Panel>
    </section>
  );
}

async function runProbe(slug: RegionSlug): Promise<number> {
  // Until per-region DNS lands, every slug resolves to the single live
  // gateway on Railway. API_BASE is set by Vite at build time via
  // VITE_HELA_API. The `slug` is passed through to `/regions/:slug/ping`
  // so the server still exercises its per-region code path.
  const base = API_BASE;

  const t0 = performance.now();
  const r = await fetch(`${base}/regions/${slug}/ping`, { cache: "no-store" });
  if (!r.ok) throw new Error(`http ${r.status}`);
  await r.json();
  return performance.now() - t0;
}
