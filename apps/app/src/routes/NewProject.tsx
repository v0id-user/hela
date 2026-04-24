import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { createProject, Region, Tier, TIER_PRICE } from "../lib/api";
import { Page, Panel } from "../components/Layout";

const REGIONS: { slug: Region; label: string }[] = [
  { slug: "iad", label: "Ashburn · US East" },
  { slug: "sjc", label: "San Jose · US West" },
  { slug: "ams", label: "Amsterdam · EU" },
  { slug: "sin", label: "Singapore · Asia" },
  { slug: "syd", label: "Sydney · AU" },
];

const TIERS: { slug: Tier; title: string; blurb: string }[] = [
  { slug: "free", title: "Free", blurb: "100 conns · 1M msgs/mo" },
  { slug: "starter", title: "Starter", blurb: "1k conns · 10M msgs/mo" },
  { slug: "growth", title: "Growth", blurb: "10k conns · 100M msgs/mo · 99.9% SLA" },
  { slug: "scale", title: "Scale", blurb: "100k conns · 1B msgs/mo · multi-region" },
];

export function NewProject() {
  const [name, setName] = useState("");
  const [region, setRegion] = useState<Region>("iad");
  const [tier, setTier] = useState<Tier>("free");
  const navigate = useNavigate();

  function submit() {
    if (!name.trim()) return;
    const p = createProject({ name: name.trim(), region, tier });
    navigate({ to: "/projects/$id", params: { id: p.id } });
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
          region is fixed after creation. pick whichever is closest to most of your users —
          sub-100ms is easy in-region.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
          {REGIONS.map((r) => (
            <button
              key={r.slug}
              onClick={() => setRegion(r.slug)}
              style={{
                padding: "10px",
                background: region === r.slug ? "#1a1613" : "#0d0d0d",
                color: region === r.slug ? "#c9a76a" : "#c0c0c0",
                border: region === r.slug ? "1px solid #c9a76a" : "1px solid #333",
                textAlign: "left",
              }}
            >
              <div style={{ fontSize: 14 }}>{r.slug}</div>
              <div style={{ fontSize: 10, color: "#888" }}>{r.label}</div>
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

      <div style={{ display: "flex", gap: 6 }}>
        <button className="cta" onClick={submit} disabled={!name.trim()}>
          [ create project ]
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
