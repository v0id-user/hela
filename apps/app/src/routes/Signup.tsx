import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { signup, ApiError } from "../lib/api";
import { Page, Panel } from "../components/Layout";

export function Signup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@") || password.length < 8) {
      setError("email must look like an email; password must be at least 8 chars");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signup(email.trim(), password);
      // Full reload so bootstrap() re-runs and the root route picks up
      // the new session for SessionChip + route guards.
      window.location.href = "/";
    } catch (err) {
      const msg = err instanceof ApiError ? humanError(err) : "signup failed; try again";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page>
      <h1 style={{ fontSize: 22, marginBottom: 14 }}>create an account</h1>

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
              autoComplete="new-password"
              placeholder="at least 8 characters"
              style={inputStyle}
              minLength={8}
              required
            />
          </div>
          {error && <div style={{ color: "#e07b7b", fontSize: 12, marginBottom: 10 }}>{error}</div>}
          <button type="submit" disabled={busy} className="cta" style={{ width: "100%" }}>
            [ {busy ? "creating…" : "create account"} ]
          </button>
        </form>
      </Panel>

      <div style={{ fontSize: 12, color: "#888", textAlign: "center", marginTop: 10 }}>
        already have one?{" "}
        <Link to="/login" style={{ color: "#c9a76a" }}>
          sign in
        </Link>
        . github sign-in is coming once we ship the OAuth flow.
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

function humanError(err: ApiError): string {
  if (err.status === 400) return "email or password is invalid";
  if (err.status === 409 || err.message.includes("has already been taken")) {
    return "an account with that email already exists; try sign in";
  }
  return err.message;
}
