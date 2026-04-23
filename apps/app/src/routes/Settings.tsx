import { account, signout } from "../lib/api";
import { Page, Panel, KV } from "../components/Layout";

export function Settings() {
  const a = account()!;

  return (
    <Page>
      <h1 style={{ fontSize: 22, marginBottom: 14 }}>settings</h1>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Panel title="identity">
          <KV k="email" v={a.email} />
          <KV k="github" v={a.github_id ?? "not linked"} />
          <div style={{ marginTop: 10, display: "flex", gap: 6 }}>
            <button>[ change password ]</button>
            <button>[ link github ]</button>
          </div>
        </Panel>

        <Panel title="danger zone" right="irreversible">
          <div style={{ fontSize: 12, color: "#888", marginBottom: 10 }}>
            deleting your account cancels all project subscriptions
            immediately, revokes all API keys, and removes all message
            history. the refund for the remainder of the billing period
            prorates automatically.
          </div>
          <button
            onClick={() => {
              if (confirm("delete account?")) {
                signout();
                localStorage.clear();
                window.location.href = "/signup";
              }
            }}
          >
            [ delete account ]
          </button>
        </Panel>
      </div>
    </Page>
  );
}
