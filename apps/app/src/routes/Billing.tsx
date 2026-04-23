import { account, projects, TIER_PRICE } from "../lib/api";
import { Page, Panel, KV } from "../components/Layout";

export function Billing() {
  const a = account()!;
  const ps = projects();
  const total = ps.reduce((sum, p) => sum + TIER_PRICE[p.tier], 0);

  return (
    <Page>
      <h1 style={{ fontSize: 22, marginBottom: 14 }}>billing</h1>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <Panel title="stripe customer">
          <KV k="email" v={a.email} />
          <KV k="customer id" v={a.stripe_customer_id ?? "—"} />
          <KV k="payment method" v="•••• 4242" />
          <div style={{ marginTop: 10 }}>
            <a
              href="https://billing.stripe.com/p/demo"
              target="_blank"
              rel="noreferrer"
            >
              <button>[ open stripe portal ]</button>
            </a>
          </div>
        </Panel>

        <Panel title="this month">
          <KV k="projects" v={ps.length} />
          <KV k="subscription total" v={"$" + total} />
          <KV k="overage est." v="$0" />
          <KV k="next invoice" v={new Date(Date.now() + 86400 * 10 * 1000).toISOString().slice(0, 10)} />
        </Panel>
      </div>

      <Panel title="upcoming invoice · line items">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ color: "#666", borderBottom: "1px solid #222" }}>
              <th style={{ textAlign: "left", padding: "4px 8px" }}>project</th>
              <th style={{ textAlign: "left", padding: "4px 8px" }}>tier</th>
              <th style={{ textAlign: "right", padding: "4px 8px" }}>$/mo</th>
            </tr>
          </thead>
          <tbody>
            {ps.map((p) => (
              <tr key={p.id} style={{ borderBottom: "1px dotted #1a1a1a" }}>
                <td style={{ padding: "4px 8px" }}>{p.name}</td>
                <td style={{ padding: "4px 8px", color: "#888" }}>{p.tier}</td>
                <td style={{ padding: "4px 8px", textAlign: "right", color: "#c0c0c0" }}>
                  ${TIER_PRICE[p.tier]}
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={2} style={{ padding: "6px 8px", color: "#888" }}>
                total
              </td>
              <td style={{ padding: "6px 8px", textAlign: "right", color: "#c9a76a" }}>
                ${total}
              </td>
            </tr>
          </tbody>
        </table>
      </Panel>
    </Page>
  );
}
