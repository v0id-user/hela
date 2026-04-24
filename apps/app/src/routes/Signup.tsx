import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { signup } from "../lib/api";
import { Page, Panel } from "../components/Layout";

export function Signup() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  async function submit() {
    if (!email.includes("@")) return;
    setSubmitting(true);
    signup(email);
    navigate({ to: "/" });
  }

  return (
    <Page>
      <div style={{ maxWidth: 420, margin: "40px auto" }}>
        <Panel title="sign up">
          <div style={{ fontSize: 12, color: "#888", marginBottom: 14 }}>
            one account per person. you'll pick the project name, region, and tier on the next
            screen. payment method only collected for paid tiers.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label>
              <div style={{ fontSize: 10, color: "#666", marginBottom: 2 }}>EMAIL</div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ width: "100%" }}
              />
            </label>
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <button
                className="cta"
                onClick={submit}
                disabled={submitting || !email.includes("@")}
              >
                [ continue ]
              </button>
              <button onClick={() => alert("GitHub OAuth is TODO; use email for now.")}>
                [ with github ]
              </button>
            </div>
          </div>
        </Panel>

        <div style={{ marginTop: 14, fontSize: 11, color: "#666", textAlign: "center" }}>
          this demo dashboard persists your account locally. real signup is a normal email + github
          flow; no magic.
        </div>
      </div>
    </Page>
  );
}
