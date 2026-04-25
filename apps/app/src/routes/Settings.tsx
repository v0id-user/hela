import { useState } from "react";
import { account, signout } from "../lib/api";
import { Page, Panel, KV } from "../components/Layout";

// Identity surfaces only what the backend actually exposes today:
// email and (optional) github_id. Buttons that don't have a wired
// endpoint behind them are gone — change-password, link-github,
// and delete-account aren't implemented in the control plane yet.
// "Coming soon" notes mark the gap honestly so the page doesn't
// pretend to do things it can't.
//
// Email verification: the accounts schema doesn't track a verified_at
// column yet. Account creation does not send a verification email.
// The banner here makes that clear so users don't assume the email
// has been confirmed.

export function Settings() {
  const a = account()!;
  const [signingOut, setSigningOut] = useState(false);

  async function doSignout() {
    setSigningOut(true);
    await signout();
    window.location.href = "/login";
  }

  return (
    <Page>
      <h1 style={{ fontSize: 22, marginBottom: 14 }}>settings</h1>

      <Panel
        title="email not verified yet"
        right="todo"
        style={{ marginBottom: 12, borderColor: "#c9a76a" }}
      >
        <div style={{ fontSize: 12, color: "#c0c0c0", lineHeight: 1.6 }}>
          We don't run email verification today. Your account works regardless, but anyone could
          have signed up with this address. A real verification flow (token email, confirm endpoint,
          verified_at column) is on the roadmap — until it ships, treat email as "claimed" not
          "verified".
        </div>
      </Panel>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Panel title="identity">
          <KV k="email" v={a.email} />
          <KV k="github" v={a.github_id ?? <span style={{ color: "#888" }}>not linked</span>} />
          <KV k="account id" v={a.id} />
          <div style={{ fontSize: 11, color: "#666", marginTop: 10, lineHeight: 1.5 }}>
            password change and GitHub OAuth aren't built into the control plane yet. when they land
            they'll show up here.
          </div>
        </Panel>

        <Panel title="session">
          <div style={{ fontSize: 12, color: "#888", marginBottom: 10, lineHeight: 1.5 }}>
            signs you out on this device. the session cookie is cleared client-side; the server uses
            Phoenix's signed cookie session, so any cookie copy from another device stays valid
            until it expires.
          </div>
          <button onClick={doSignout} disabled={signingOut}>
            [ {signingOut ? "signing out…" : "sign out"} ]
          </button>
        </Panel>
      </div>

      <div style={{ marginTop: 12 }}>
        <Panel title="danger zone" right="not built">
          <div style={{ fontSize: 12, color: "#888", lineHeight: 1.5 }}>
            account deletion isn't implemented in the control plane yet. when it is, deleting here
            will cancel paid subscriptions in Polar, revoke API keys, and remove your row from the
            accounts table.
          </div>
        </Panel>
      </div>
    </Page>
  );
}
