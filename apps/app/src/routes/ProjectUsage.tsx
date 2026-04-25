import { useEffect, useState } from "react";
import { useParams, Link } from "@tanstack/react-router";
import { getProject, ApiError, Project } from "../lib/api";
import { Page, Panel } from "../components/Layout";

// Backend doesn't expose /api/usage yet. Rather than fabricate
// numbers (the previous version did, deterministically — which
// looked real and was misleading), the page tells the truth and
// points at the Polar dashboard for now.
export function ProjectUsage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const [p, setP] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getProject(id)
      .then(setP)
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 404) setError("not_found");
        else setError(e instanceof Error ? e.message : "couldn't load");
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
  if (error || !p) {
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
        <h1 style={{ fontSize: 22, marginTop: 4 }}>usage</h1>
      </div>

      <Panel title="not wired up yet">
        <div style={{ fontSize: 13, color: "#c0c0c0", lineHeight: 1.6 }}>
          The control plane doesn't expose a usage endpoint yet. Once <code>/api/usage</code>
          lands, this page will show live connections and message counts per project against the
          tier cap.
        </div>
        <div style={{ fontSize: 12, color: "#888", marginTop: 10 }}>
          Until then: paid-tier customers can see their billing usage in the Polar customer portal.
        </div>
      </Panel>
    </Page>
  );
}
