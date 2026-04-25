import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { login, AuthError } from "../lib/api";
import { Page, Panel } from "../components/Layout";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
      // Full reload so bootstrap() re-runs and the root route sees
      // the fresh session.
      window.location.href = "/";
    } catch (err) {
      const msg =
        err instanceof AuthError && err.status === 401
          ? "email or password is wrong"
          : "sign-in failed; try again";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page>
      <h1 style={{ fontSize: 22, marginBottom: 14 }}>sign in</h1>

      <Panel title="email + password" style={{ marginBottom: 12 }}>
        <form onSubmit={submit}>
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
              style={inputStyle}
              required
            />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              style={inputStyle}
              required
            />
          </div>
          {error && (
            <div style={{ color: "#e07b7b", fontSize: 12, marginBottom: 10 }}>{error}</div>
          )}
          <button type="submit" disabled={busy} className="cta" style={{ width: "100%" }}>
            [ {busy ? "signing in…" : "sign in"} ]
          </button>
        </form>
      </Panel>

      <div style={{ fontSize: 12, color: "#888", textAlign: "center", marginTop: 10 }}>
        no account yet? <Link to="/signup" style={{ color: "#c9a76a" }}>create one</Link>.
      </div>
    </Page>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  color: "#888",
  marginBottom: 4,
  letterSpacing: 0.5,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  fontSize: 14,
  padding: "8px 10px",
  background: "#0a0a0a",
  color: "#e0e0e0",
  border: "1px solid #333",
};
