import { useEffect } from "react";
import { signupUrl } from "../lib/urls";

/**
 * `/signup` on the marketing site redirects to the real signup form
 * on the app origin. Keeping a short URL on the marketing origin
 * means we can print it on cards or emails later without committing
 * to cross-subdomain cookie plumbing here — the app origin stays the
 * source of truth for auth state.
 */
export function Signup() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tier = params.get("tier") ?? undefined;
    window.location.replace(signupUrl(tier));
  }, []);

  return (
    <div
      style={{
        padding: "80px 20px",
        textAlign: "center",
        color: "#888",
        fontSize: 12,
      }}
    >
      <div style={{ fontSize: 10, color: "#c9a76a", letterSpacing: 1.5, marginBottom: 10 }}>
        REDIRECTING
      </div>
      <div>
        taking you to the signup form at{" "}
        <a href={signupUrl()} style={{ color: "#c0c0c0" }}>
          {signupUrl()}
        </a>
      </div>
    </div>
  );
}
