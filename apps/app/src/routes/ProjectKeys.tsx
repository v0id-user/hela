import { useEffect, useState } from "react";
import { useParams, Link } from "@tanstack/react-router";
import { getProject, listKeys, createKey, revokeKey, ApiError, ApiKey, Project } from "../lib/api";
import { Page, Panel } from "../components/Layout";

export function ProjectKeys() {
  const { id } = useParams({ strict: false }) as { id: string };
  const [p, setP] = useState<Project | null>(null);
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [lastNew, setLastNew] = useState<{ wire: string } | null>(null);

  async function refresh() {
    setKeys(await listKeys(id));
  }

  useEffect(() => {
    Promise.all([getProject(id), listKeys(id)])
      .then(([proj, ks]) => {
        setP(proj);
        setKeys(ks);
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 404) {
          setError("not_found");
        } else {
          setError(e instanceof Error ? e.message : "couldn't load");
        }
      });
  }, [id]);

  async function create() {
    setBusy(true);
    try {
      const { wire } = await createKey(id, newLabel.trim() || undefined);
      setLastNew({ wire });
      setNewLabel("");
      await refresh();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(keyId: string) {
    if (!confirm("revoke this key? backends using it will get 401 on next call.")) return;
    setBusy(true);
    try {
      await revokeKey(id, keyId);
      await refresh();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error === "not_found") {
    return (
      <Page>
        <Panel title="not found">
          <span style={{ color: "#888" }}>no project with id {id}</span>
        </Panel>
      </Page>
    );
  }
  if (error || !p || !keys) {
    return (
      <Page>
        <div style={{ color: error ? "#e07b7b" : "#888", fontSize: 13 }}>{error ?? "loading…"}</div>
      </Page>
    );
  }

  return (
    <Page>
      <div style={{ marginBottom: 14 }}>
        <Link to="/projects/$id" params={{ id }}>
          <span style={{ color: "#888", fontSize: 11 }}>← {p.name}</span>
        </Link>
        <h1 style={{ fontSize: 22, marginTop: 4 }}>api keys</h1>
      </div>

      <Panel
        title="keys · this project"
        right={`${keys.length} active`}
        style={{ marginBottom: 12 }}
      >
        <div style={{ fontSize: 12, color: "#888", marginBottom: 10 }}>
          API keys are used by your backend to issue JWTs via <code>POST /v1/tokens</code> (or to
          call REST publish endpoints). keep them out of the browser. we only ever show the full
          secret once, at creation.
        </div>
        {keys.length === 0 ? (
          <div style={{ fontSize: 12, color: "#888", padding: "8px 0" }}>
            no keys yet — create one below.
          </div>
        ) : (
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: "#666", borderBottom: "1px solid #222" }}>
                <th style={{ textAlign: "left", padding: "4px 8px" }}>prefix</th>
                <th style={{ textAlign: "left", padding: "4px 8px" }}>label</th>
                <th style={{ textAlign: "left", padding: "4px 8px" }}>last used</th>
                <th style={{ textAlign: "right", padding: "4px 8px" }} />
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} style={{ borderBottom: "1px dotted #1a1a1a" }}>
                  <td style={{ padding: "4px 8px", color: "#c9a76a" }}>
                    hk_{k.prefix}_<span style={{ color: "#666" }}>•••</span>
                  </td>
                  <td style={{ padding: "4px 8px" }}>{k.label ?? "—"}</td>
                  <td style={{ padding: "4px 8px", color: "#888" }}>
                    {k.last_used_at ? k.last_used_at.slice(0, 16).replace("T", " ") : "—"}
                  </td>
                  <td style={{ padding: "4px 8px", textAlign: "right" }}>
                    <button onClick={() => revoke(k.id)} disabled={busy}>
                      [ revoke ]
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div style={{ marginTop: 12, display: "flex", gap: 6 }}>
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="label (optional, e.g. 'prod backend')"
            style={{ flex: 1, fontSize: 12, padding: "6px 8px" }}
          />
          <button onClick={create} disabled={busy}>
            [ {busy ? "creating…" : "new key"} ]
          </button>
        </div>
      </Panel>

      {lastNew && (
        <Panel title="new key · copy now" style={{ borderColor: "#c9a76a" }}>
          <div style={{ fontSize: 12, color: "#c9a76a", marginBottom: 10 }}>
            this is the only time we'll show the full secret. paste it into your backend's env var
            right now.
          </div>
          <pre
            style={{
              background: "#0d0d0d",
              border: "1px solid #c9a76a",
              padding: 10,
              fontSize: 12,
              margin: 0,
              userSelect: "all",
              overflow: "auto",
            }}
          >
            {lastNew.wire}
          </pre>
        </Panel>
      )}
    </Page>
  );
}
