import { useEffect, useState } from "react";
import { Hero } from "../components/Hero";
import { Primitives } from "../components/Primitives";
import { RegionPicker } from "../components/RegionPicker";
import { Pricing } from "../components/Pricing";
import { Quickstart } from "../components/Quickstart";
import { SIGNIN_URL } from "../lib/urls";

export function Home() {
  return (
    <div>
      <Hero />
      <Separator />
      <Primitives />
      <Separator />
      <RegionPicker />
      <Separator />
      <Pricing />
      <Separator />
      <Quickstart />
      <Footer />
    </div>
  );
}

function Separator() {
  return (
    <div
      style={{
        borderTop: "1px solid #1a1a1a",
        maxWidth: 1100,
        margin: "0 auto",
      }}
    />
  );
}

function Footer() {
  return (
    <footer
      style={{
        borderTop: "1px solid #333",
        marginTop: 40,
        padding: "20px 20px 40px",
        maxWidth: 1100,
        marginLeft: "auto",
        marginRight: "auto",
        display: "flex",
        justifyContent: "space-between",
        fontSize: 11,
        color: "#666",
      }}
    >
      <span>
        hela · open source real time on BEAM · <VersionStamp />
      </span>
      <span>
        <a href="/how" style={{ color: "#888" }}>
          how
        </a>
        {" · "}
        <a href="/dashboard" style={{ color: "#888" }}>
          dashboard
        </a>
        {" · "}
        <a href={SIGNIN_URL} style={{ color: "#888" }}>
          sign in
        </a>
        {" · "}
        <a href="mailto:hey@v0id.me" style={{ color: "#888" }}>
          contact
        </a>
      </span>
    </footer>
  );
}

function VersionStamp() {
  const [commit, setCommit] = useState<string>("dev");

  useEffect(() => {
    fetch("/version", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((v: { commit?: string } | null) => {
        if (v?.commit) setCommit(v.commit.slice(0, 7));
      })
      .catch(() => {});
  }, []);

  return <span>{commit}</span>;
}
