import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { createProject, ApiError, Region, Tier, TIER_PRICE } from "../lib/api";
import { Page, Panel } from "../components/Layout";

// Region picker reflects what's actually live on the hosted plane.
// Today only Amsterdam is deployed. The other slugs are reserved in
// the SDK + backend schemas but resolve to the Amsterdam gateway via
// the SDK region map until those clusters come up. Don't offer them
// here — picking them just produces a confusing project that lives
// in `ams` anyway.
const REGIONS: { slug: Region; label: string; live: boolean }[] = [
  { slug: "ams", label: "Amsterdam · EU", live: true },
  { slug: "iad", label: "Ashburn · US East", live: false },
  { slug: "sjc", label: "San Jose · US West", live: false },
  { slug: "sin", label: "Singapore · Asia", live: false },
  { slug: "syd", label: "Sydney · AU", live: false },
];

// Canonical plan catalog: docs/hosted-plans/. Keep these blurbs in sync with
// the per-tier files there; the directory wins on any disagreement.
const TIERS: { slug: Tier; title: string; blurb: string }[] = [
  { slug: "free", title: "Free", blurb: "100 conns · 1M msgs/mo" },
  { slug: "starter", title: "Starter", blurb: "1k conns · 10M msgs/mo" },
  { slug: "growth", title: "Growth", blurb: "10k conns · 100M msgs/mo · 99.9% SLA" },
  { slug: "scale", title: "Scale", blurb: "100k conns · 1B msgs/mo · multi-region" },
];

export function NewProject() {
  const [name, setName] = useState("");
  const [region, setRegion] = useState<Region>("ams");
  const [tier, setTier] = useState<Tier>("free");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const p = await createProject({ name: name.trim(), region, tier });
      navigate({ to: "/projects/$id", params: { id: p.id } });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "couldn't create project";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page>
      <h1 style={{ fontSize: 22, marginBottom: 14 }}>new project</h1>

      <Panel title="1. name it" style={{ marginBottom: 12 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. my-app-chat"
          style={{ width: "100%", fontSize: 14, padding: "6px 10px" }}
        />
      </Panel>

      <Panel title="2. pick a region" style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>
          region is fixed after creation. Amsterdam is the only live region today; the rest are
          planned and listed for transparency.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
          {REGIONS.map((r) => (
            <button
              key={r.slug}
              onClick={() => r.live && setRegion(r.slug)}
              disabled={!r.live}
              style={{
                padding: "10px",
                background: !r.live ? "#080808" : region === r.slug ? "#1a1613" : "#0d0d0d",
                color: !r.live ? "#444" : region === r.slug ? "#c9a76a" : "#c0c0c0",
                border: !r.live
                  ? "1px solid #1f1f1f"
                  : region === r.slug
                    ? "1px solid #c9a76a"
                    : "1px solid #333",
                textAlign: "left",
                cursor: r.live ? "pointer" : "not-allowed",
              }}
            >
              <div style={{ fontSize: 14 }}>{r.slug}</div>
              <div style={{ fontSize: 10, color: !r.live ? "#333" : "#888" }}>
                {r.label}
                {!r.live && " (planned)"}
              </div>
            </button>
          ))}
        </div>
      </Panel>

      <Panel title="3. pick a tier" style={{ marginBottom: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {TIERS.map((t) => (
            <button
              key={t.slug}
              onClick={() => setTier(t.slug)}
              style={{
                padding: "12px",
                background: tier === t.slug ? "#1a1613" : "#0d0d0d",
                color: tier === t.slug ? "#c9a76a" : "#c0c0c0",
                border: tier === t.slug ? "1px solid #c9a76a" : "1px solid #333",
                textAlign: "left",
              }}
            >
              <div style={{ fontSize: 13 }}>{t.title}</div>
              <div style={{ fontSize: 10, color: "#888", marginTop: 4 }}>{t.blurb}</div>
              <div style={{ fontSize: 14, color: "#e0e0e0", marginTop: 6 }}>
                ${TIER_PRICE[t.slug]}/mo
              </div>
            </button>
          ))}
        </div>
      </Panel>

      {error && <div style={{ color: "#e07b7b", fontSize: 12, marginBottom: 10 }}>{error}</div>}

      <div style={{ display: "flex", gap: 6 }}>
        <button className="cta" onClick={submit} disabled={busy || !name.trim()}>
          [ {busy ? "creating…" : "create project"} ]
        </button>
        {tier !== "free" && (
          <span style={{ color: "#666", fontSize: 11, alignSelf: "center" }}>
            &gt; Polar will collect payment on first paid project; reused on subsequent ones.
          </span>
        )}
      </div>
    </Page>
  );
}
