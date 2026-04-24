import { useState } from "react";
import { SectionHeading } from "./Panel";
import { signupUrl } from "../lib/urls";

const TIERS = [
  {
    name: "Free",
    slug: "free",
    price: "$0",
    conns: "100",
    msgs: "1M",
    rate: "5/s",
    regions: "1",
    history: "1k msgs",
    sla: "none",
    cta: "start free",
  },
  {
    name: "Starter",
    slug: "starter",
    price: "$19",
    conns: "1,000",
    msgs: "10M",
    rate: "15/s",
    regions: "1",
    history: "10k msgs",
    sla: "none",
    cta: "get Starter",
  },
  {
    name: "Growth",
    slug: "growth",
    price: "$99",
    conns: "10,000",
    msgs: "100M",
    rate: "100/s",
    regions: "1",
    history: "100k msgs",
    sla: "99.9%",
    cta: "get Growth",
    featured: true,
  },
  {
    name: "Scale",
    slug: "scale",
    price: "$499",
    conns: "100,000",
    msgs: "1B",
    rate: "1k/s",
    regions: "up to 3, replicated",
    history: "1M msgs",
    sla: "99.95%",
    cta: "get Scale",
  },
  {
    name: "Enterprise",
    slug: "ent",
    price: "contact",
    conns: "custom",
    msgs: "custom",
    rate: "custom",
    regions: "all regions",
    history: "custom",
    sla: "99.99%",
    cta: "contact sales",
  },
];

export function Pricing() {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? TIERS : TIERS.slice(0, 4);

  return (
    <section style={{ padding: "40px 20px", maxWidth: 1100, margin: "0 auto" }}>
      <SectionHeading
        eyebrow="pricing"
        title="flat monthly. no per-message billing."
        sub="billed monthly. 2 months free on annual. overage $0.50 per million above the tier cap, connection caps are hard. full source on GitHub."
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${visible.length}, minmax(0,1fr))`,
          gap: 10,
        }}
      >
        {visible.map((t) => (
          <div
            key={t.slug}
            style={{
              background: "#0a0a0a",
              border: t.featured ? "1px solid #c9a76a" : "1px solid #333",
              padding: 14,
              position: "relative",
            }}
          >
            {t.featured && (
              <div
                style={{
                  position: "absolute",
                  top: -8,
                  left: 10,
                  background: "#111",
                  color: "#c9a76a",
                  padding: "0 6px",
                  fontSize: 9,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                }}
              >
                most picked
              </div>
            )}
            <div
              style={{
                fontSize: 10,
                color: "#888",
                letterSpacing: 0.5,
                textTransform: "uppercase",
              }}
            >
              {t.name}
            </div>
            <div style={{ fontSize: 28, color: "#e0e0e0", marginTop: 4 }}>
              {t.price}
              {t.price !== "contact" && <span style={{ fontSize: 11, color: "#666" }}> /mo</span>}
            </div>

            <div style={{ marginTop: 10, fontSize: 11, color: "#c0c0c0" }}>
              <Row k="connections" v={t.conns} />
              <Row k="messages/mo" v={t.msgs} />
              <Row k="publish rate" v={t.rate} />
              <Row k="regions" v={t.regions} />
              <Row k="history" v={t.history} />
              <Row k="sla" v={t.sla} />
            </div>

            <a
              href={t.slug === "ent" ? "mailto:hey@v0id.me" : signupUrl(t.slug)}
              style={{ display: "block", marginTop: 14 }}
            >
              <button className={t.featured ? "cta" : ""} style={{ width: "100%" }}>
                [ {t.cta} ]
              </button>
            </a>
          </div>
        ))}
      </div>

      {!showAll && (
        <div style={{ marginTop: 10, textAlign: "right" }}>
          <button onClick={() => setShowAll(true)}>[ see Enterprise ]</button>
        </div>
      )}
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "2px 0",
        borderBottom: "1px dotted #1a1a1a",
      }}
    >
      <span style={{ color: "#666" }}>{k}</span>
      <span>{v}</span>
    </div>
  );
}
