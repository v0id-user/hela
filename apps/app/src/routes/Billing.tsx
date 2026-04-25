import { useEffect, useState } from "react";
import { account, listProjects, Project, TIER_PRICE } from "../lib/api";
import { Page, Panel, KV } from "../components/Layout";

// We don't fabricate billing data. The previous version showed a
// hardcoded "•••• 4242" payment method and a synthetic next-invoice
// date that had no relation to the real Polar subscription state.
// Until the control plane proxies a real `/api/billing` summary
// (Polar GET /v1/customers/{id}/subscriptions etc.), this page
// shows what we actually know — the Polar customer id from signup
// — and points at Polar's hosted customer portal for the rest.

export function Billing() {
  const a = account()!;
  const [ps, setPs] = useState<Project[] | null>(null);

  useEffect(() => {
    listProjects()
      .then(setPs)
      .catch(() => setPs([]));
  }, []);

  const subTotal = ps ? ps.reduce((sum, p) => sum + TIER_PRICE[p.tier], 0) : 0;
  const paidProjects = ps ? ps.filter((p) => p.tier !== "free").length : 0;

  return (
    <Page>
      <h1 style={{ fontSize: 22, marginBottom: 14 }}>billing</h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <Panel title="billing account">
          <KV k="email" v={a.email} />
          <KV
            k="polar customer"
            v={a.polar_customer_id ?? <span style={{ color: "#888" }}>not yet provisioned</span>}
          />
          <div style={{ fontSize: 11, color: "#666", marginTop: 10, lineHeight: 1.5 }}>
            payment methods, invoices, and subscription state live in Polar's customer portal. we
            don't mirror them here.
          </div>
        </Panel>

        <Panel title="this month">
          <KV k="projects" v={ps ? ps.length : "…"} />
          <KV k="paid projects" v={ps ? paidProjects : "…"} />
          <KV k="subscription total" v={ps ? "$" + subTotal : "…"} />
          <div style={{ fontSize: 11, color: "#666", marginTop: 10, lineHeight: 1.5 }}>
            subtotal is each paid project's flat tier price. overage and the next invoice date come
            from Polar — open the portal to see them.
          </div>
        </Panel>
      </div>

      <Panel title="active subscriptions">
        {ps === null ? (
          <div style={{ color: "#888", fontSize: 13 }}>loading…</div>
        ) : ps.filter((p) => p.tier !== "free").length === 0 ? (
          <div style={{ color: "#888", fontSize: 13 }}>
            no paid projects yet. create one with a paid tier and Polar collects payment on
            checkout.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ color: "#666", borderBottom: "1px solid #222" }}>
                <th style={{ textAlign: "left", padding: "4px 8px" }}>project</th>
                <th style={{ textAlign: "left", padding: "4px 8px" }}>tier</th>
                <th style={{ textAlign: "right", padding: "4px 8px" }}>$/mo</th>
              </tr>
            </thead>
            <tbody>
              {ps
                .filter((p) => p.tier !== "free")
                .map((p) => (
                  <tr key={p.id} style={{ borderBottom: "1px dotted #1a1a1a" }}>
                    <td style={{ padding: "4px 8px" }}>{p.name}</td>
                    <td style={{ padding: "4px 8px", color: "#888" }}>{p.tier}</td>
                    <td
                      style={{
                        padding: "4px 8px",
                        textAlign: "right",
                        color: "#c0c0c0",
                      }}
                    >
                      ${TIER_PRICE[p.tier]}
                    </td>
                  </tr>
                ))}
              <tr>
                <td colSpan={2} style={{ padding: "6px 8px", color: "#888" }}>
                  subscription total
                </td>
                <td
                  style={{
                    padding: "6px 8px",
                    textAlign: "right",
                    color: "#c9a76a",
                  }}
                >
                  ${subTotal}
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </Panel>
    </Page>
  );
}
