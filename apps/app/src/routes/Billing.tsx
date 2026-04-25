import { useEffect, useState } from "react";
import { getBilling, BillingSummary, TIER_PRICE } from "../lib/api";
import { Page, Panel, KV } from "../components/Layout";

// Real billing summary from the control plane (which proxies Polar's
// customer state). We don't fabricate payment-method previews or
// invoice dates anymore — fields that aren't yet known render as
// "—" or as empty states.

export function Billing() {
  const [b, setB] = useState<BillingSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getBilling()
      .then(setB)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "couldn't load"));
  }, []);

  if (error) {
    return (
      <Page>
        <Panel title="couldn't load billing">
          <div style={{ color: "#e07b7b", fontSize: 13 }}>{error}</div>
        </Panel>
      </Page>
    );
  }

  if (b === null) {
    return (
      <Page>
        <div style={{ color: "#888", fontSize: 13 }}>loading…</div>
      </Page>
    );
  }

  const paidProjects = b.projects.filter((p) => p.tier !== "free");
  const flatTotal = paidProjects.reduce((sum, p) => sum + TIER_PRICE[p.tier], 0);

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
          <KV k="email" v={b.account.email} />
          <KV
            k="polar customer"
            v={
              b.account.polar_customer_id ?? <span style={{ color: "#888" }}>not provisioned</span>
            }
          />
          <KV
            k="payment method"
            v={
              b.has_payment_method ? (
                <span style={{ color: "#c0c0c0" }}>on file</span>
              ) : (
                <span style={{ color: "#888" }}>none</span>
              )
            }
          />
          <div style={{ fontSize: 11, color: "#666", marginTop: 10, lineHeight: 1.5 }}>
            payment methods, invoices, and dunning state live in Polar's hosted customer portal. we
            surface presence + current subscriptions here, not the full ledger.
          </div>
        </Panel>

        <Panel title="this month">
          <KV k="projects" v={b.projects.length} />
          <KV k="paid projects" v={paidProjects.length} />
          <KV k="active subs in polar" v={b.subscriptions.length} />
          <KV k="flat tier total" v={"$" + flatTotal} />
          <div style={{ fontSize: 11, color: "#666", marginTop: 10, lineHeight: 1.5 }}>
            flat tier total is the sum of each paid project's monthly tier price. overage (messages
            above tier cap) lands on Polar at invoice time and isn't summed here.
          </div>
        </Panel>
      </div>

      <Panel title="active subscriptions">
        {b.subscriptions.length === 0 ? (
          <div style={{ color: "#888", fontSize: 13 }}>
            {paidProjects.length === 0
              ? "no paid projects yet. create one with a paid tier and Polar collects payment on checkout."
              : "no active subscriptions in Polar yet — checkout may not have completed for the paid project(s) above."}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ color: "#666", borderBottom: "1px solid #222" }}>
                <th style={{ textAlign: "left", padding: "4px 8px" }}>subscription</th>
                <th style={{ textAlign: "left", padding: "4px 8px" }}>status</th>
                <th style={{ textAlign: "left", padding: "4px 8px" }}>renews</th>
                <th style={{ textAlign: "right", padding: "4px 8px" }}>amount</th>
              </tr>
            </thead>
            <tbody>
              {b.subscriptions.map((s) => (
                <tr key={s.id ?? Math.random()} style={{ borderBottom: "1px dotted #1a1a1a" }}>
                  <td style={{ padding: "4px 8px", color: "#c0c0c0" }}>
                    {s.id ? s.id.slice(0, 16) + "…" : "—"}
                  </td>
                  <td style={{ padding: "4px 8px", color: "#888" }}>{s.status ?? "—"}</td>
                  <td style={{ padding: "4px 8px", color: "#888" }}>
                    {s.current_period_end ? s.current_period_end.slice(0, 10) : "—"}
                  </td>
                  <td style={{ padding: "4px 8px", textAlign: "right", color: "#c0c0c0" }}>
                    {s.amount != null && s.currency
                      ? `${(s.amount / 100).toFixed(2)} ${s.currency.toUpperCase()}`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </Page>
  );
}
