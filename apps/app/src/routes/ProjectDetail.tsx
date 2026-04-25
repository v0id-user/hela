import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "@tanstack/react-router";
import { getProject, setProjectJwk, deleteProject, ApiError, Project } from "../lib/api";
import { Page, Panel, KV } from "../components/Layout";

export function ProjectDetail() {
  const { id } = useParams({ strict: false }) as { id: string };
  const [p, setP] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jwkInput, setJwkInput] = useState("");
  const [busy, setBusy] = useState(false);
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
    try {
      const parsed = JSON.parse(jwkInput);
      setBusy(true);
      const updated = await setProjectJwk(p!.id, parsed);
      setP(updated);
      setJwkInput("");
    } catch (e) {
      alert(e instanceof SyntaxError ? "not valid JSON" : (e as Error).message);
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
          k="jwt public key"
          v={p.jwt_registered ? "registered" : <span style={{ color: "#c9a76a" }}>not set</span>}
        />
        <KV
          k="multi-region"
          v={p.tier === "scale" || p.tier === "ent" ? "eligible" : "upgrade to enable"}
        />
      </Panel>

      <Panel title="jwt public key · register" style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>
          paste the JWK (public half) your backend signs grants with. we use this to verify tokens
          on every channel join.
        </div>
        <textarea
          value={jwkInput}
          onChange={(e) => setJwkInput(e.target.value)}
          rows={8}
          style={{ width: "100%", fontFamily: "inherit", fontSize: 12 }}
          placeholder='{ "kty": "RSA", "n": "...", "e": "AQAB", "alg": "RS256", "kid": "main" }'
        />
        <div style={{ marginTop: 8 }}>
          <button onClick={saveJwk} disabled={busy || !jwkInput.trim()}>
            [ {busy ? "registering…" : "register"} ]
          </button>
        </div>
      </Panel>

      <Panel title="danger zone" right="irreversible">
        <button onClick={deleteMe} disabled={busy}>
          [ delete project ]
        </button>
      </Panel>
    </Page>
  );
}
