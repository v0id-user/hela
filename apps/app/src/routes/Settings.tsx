import { useState } from "react";
import { account, signout, deleteAccount } from "../lib/api";
import { Page, Panel, KV } from "../components/Layout";

// Identity surfaces only what the backend exposes today: email and
// (optional) github_id. Account-delete is now real (DELETE /api/me),
// cancels Polar subs, removes projects + keys, deletes the row,
// drops the session.
//
// Email verification: the accounts schema has no verified_at column
// and signup does not send a confirmation email. The banner makes
// that explicit so users don't assume the email has been confirmed.

export function Settings() {
  const a = account()!;
  const [signingOut, setSigningOut] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmEmail, setConfirmEmail] = useState("");

  async function doSignout() {
    setSigningOut(true);
    await signout();
    window.location.href = "/login";
  }

  async function doDelete() {
    if (confirmEmail.trim() !== a.email) {
      setDeleteError("type your email to confirm");
      return;
    }
    if (
      !confirm(
        `permanently delete ${a.email}? this cancels every paid Polar subscription on this account, removes every project + API key, and deletes the row. cannot be undone.`,
      )
    ) {
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAccount();
      window.location.href = "/signup";
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "delete failed");
      setDeleting(false);
    }
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
        <Panel title="danger zone" right="irreversible" style={{ borderColor: "#6a3030" }}>
          <div style={{ fontSize: 12, color: "#e0a8a8", lineHeight: 1.6, marginBottom: 10 }}>
            <strong style={{ color: "#ff9090" }}>delete account.</strong> Cancels every paid Polar
            subscription on this account, deletes every project (which revokes its API keys and
            removes its rows on the gateway), deletes the Polar customer record, and deletes your
            account row. There is no undo. Type your email below to confirm.
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              placeholder={a.email}
              autoComplete="off"
              style={{
                flex: 1,
                fontSize: 12,
                padding: "6px 8px",
                background: "#0a0a0a",
                color: "#e0e0e0",
                border: "1px solid #333",
              }}
            />
            <button
              onClick={doDelete}
              disabled={deleting || confirmEmail.trim() !== a.email}
              style={{
                background: "#1a0d0d",
                color: confirmEmail.trim() === a.email ? "#ff9090" : "#666",
                border: "1px solid #6a3030",
              }}
            >
              [ {deleting ? "deleting…" : "delete account"} ]
            </button>
          </div>
          {deleteError && (
            <div style={{ color: "#e07b7b", fontSize: 12, marginTop: 8 }}>{deleteError}</div>
          )}
        </Panel>
      </div>
    </Page>
  );
}
