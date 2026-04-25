import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "@tanstack/react-router";
import { getProject, setProjectJwk, deleteProject, ApiError, Project } from "../lib/api";
import { Page, Panel, KV } from "../components/Layout";

const GATEWAY_URL =
  import.meta.env.VITE_HELA_GATEWAY ?? "https://gateway-production-bfdf.up.railway.app";

export function ProjectDetail() {
  const { id } = useParams({ strict: false }) as { id: string };
  const [p, setP] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jwkInput, setJwkInput] = useState("");
  const [jwkError, setJwkError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    getProject(id)
      .then(setP)
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 404) {
          setError("not_found");
        } else {
          setError(e instanceof Error ? e.message : "couldn't load");
        }
      });
  }, [id]);

  if (error === "not_found") {
    return (
      <Page>
        <Panel title="not found">
          <span style={{ color: "#888" }}>no project with id {id}</span>
        </Panel>
      </Page>
    );
  }
  if (error) {
    return (
      <Page>
        <Panel title="couldn't load project">
          <div style={{ color: "#e07b7b", fontSize: 13 }}>{error}</div>
        </Panel>
      </Page>
    );
  }
  if (p === null) {
    return (
      <Page>
        <div style={{ color: "#888", fontSize: 13 }}>loading…</div>
      </Page>
    );
  }

  async function saveJwk() {
    setJwkError(null);
    let parsed: object;
    try {
      parsed = JSON.parse(jwkInput);
    } catch {
      setJwkError("not valid JSON");
      return;
    }
    setBusy(true);
    try {
      const updated = await setProjectJwk(p!.id, parsed);
      setP(updated);
      setJwkInput("");
    } catch (e) {
      setJwkError(e instanceof Error ? e.message : "couldn't save");
    } finally {
      setBusy(false);
    }
  }

  async function deleteMe() {
    if (!confirm(`delete ${p!.name}? this cancels its Polar subscription.`)) return;
    setBusy(true);
    try {
      await deleteProject(p!.id);
      navigate({ to: "/" });
    } catch (e) {
      alert((e as Error).message);
      setBusy(false);
    }
  }

  const tokenSnippet = `curl -X POST ${GATEWAY_URL}/v1/tokens \\
  -H "Authorization: Bearer hk_<your_api_key>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "channels": ["chat:lobby"],
    "uid": "alice",
    "ttl_seconds": 3600
  }'`;

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
        <div>
          <h1 style={{ fontSize: 22 }}>{p.name}</h1>
          <div style={{ fontSize: 12, color: "#666" }}>
            {p.id} · region {p.region} · tier {p.tier} · since {p.inserted_at.slice(0, 10)}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <Link to="/projects/$id/keys" params={{ id: p.id }}>
            <button>[ keys ]</button>
          </Link>
        </div>
      </div>

      <Panel title="configuration" style={{ marginBottom: 12 }}>
        <KV k="region" v={p.region} />
        <KV k="tier" v={p.tier} />
        <KV
          k="signing"
          v={
            p.jwt_registered ? (
              <span>your own JWK (advanced)</span>
            ) : (
              <span>hela-issued (default)</span>
            )
          }
        />
        <KV
          k="multi-region"
          v={p.tier === "scale" || p.tier === "ent" ? "eligible" : "upgrade to enable"}
        />
      </Panel>

      <Panel title="quick start · backend mints tokens" style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: "#c0c0c0", lineHeight: 1.6 }}>
          The default flow: your backend holds an API key for this project, calls{" "}
          <code style={{ color: "#c9a76a" }}>POST /v1/tokens</code> on the gateway, and gets back a
          short-lived JWT. Hand the JWT to the frontend; the frontend connects with it. hela signs
          the JWT with this project's HS256 secret (server-side, never exposed). This is how Pusher,
          Ably, Stream all work — no key material on your side.
        </div>
        <div style={{ marginTop: 10, marginBottom: 10 }}>
          <Link to="/projects/$id/keys" params={{ id: p.id }}>
            <button className="cta">[ manage api keys ]</button>
          </Link>
        </div>
        <pre
          style={{
            background: "#0d0d0d",
            border: "1px solid #1f1f1f",
            padding: 10,
            fontSize: 11,
            margin: 0,
            overflow: "auto",
            color: "#c0c0c0",
            lineHeight: 1.5,
          }}
        >
          {tokenSnippet}
        </pre>
        <div style={{ fontSize: 11, color: "#666", marginTop: 8, lineHeight: 1.5 }}>
          The response is{" "}
          <code style={{ color: "#888" }}>{`{"token": "eyJ...", "expires_at": "..."}`}</code>. See{" "}
          <code style={{ color: "#888" }}>docs/api/rest.md</code> for the full request shape.
        </div>
      </Panel>

      <Panel
        title="advanced · bring your own signing key"
        right={p.jwt_registered ? "registered" : "optional"}
        style={{ marginBottom: 12 }}
      >
        <button onClick={() => setAdvancedOpen((v) => !v)} style={{ fontSize: 11, color: "#888" }}>
          [ {advancedOpen ? "hide" : "show"} ]
        </button>
        {advancedOpen && (
          <div style={{ marginTop: 10 }}>
            <div
              style={{
                background: "#1a0d0d",
                border: "1px solid #6a3030",
                padding: 10,
                marginBottom: 10,
                fontSize: 12,
                color: "#e0a8a8",
                lineHeight: 1.5,
              }}
            >
              <strong style={{ color: "#ff9090" }}>warning.</strong> This box accepts the{" "}
              <strong>public</strong> half of an asymmetric key pair (RSA, EC, or OKP). Never paste
              a private key here. The control plane rejects JWKs that contain a private field (
              <code>d</code>), symmetric secrets (<code>kty=oct</code>), or unknown key types — but
              the rejection is a safety net, not your first line of defence. Read what you're
              pasting.
            </div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 8, lineHeight: 1.6 }}>
              Use this when you already mint JWTs in your own infrastructure (Auth0, custom OIDC, an
              HSM) and don't want to hand a hela API key to that path. Once a JWK is registered
              here, the gateway verifies inbound tokens against it instead of the hela-issued HS256
              secret.
            </div>
            <textarea
              value={jwkInput}
              onChange={(e) => setJwkInput(e.target.value)}
              rows={8}
              style={{ width: "100%", fontFamily: "inherit", fontSize: 12 }}
              placeholder='{ "kty": "RSA", "n": "...", "e": "AQAB", "alg": "RS256", "kid": "main" }'
            />
            {jwkError && (
              <div style={{ color: "#e07b7b", fontSize: 12, marginTop: 8 }}>{jwkError}</div>
            )}
            <div style={{ marginTop: 8 }}>
              <button onClick={saveJwk} disabled={busy || !jwkInput.trim()}>
                [ {busy ? "registering…" : "register"} ]
              </button>
            </div>
          </div>
        )}
      </Panel>

      <Panel title="danger zone" right="irreversible">
        <button onClick={deleteMe} disabled={busy}>
          [ delete project ]
        </button>
      </Panel>
    </Page>
  );
}
