const env = (
  import.meta as {
    env?: { VITE_HELA_APP?: string; VITE_HELA_DOCS?: string };
  }
).env;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isLocalBrowserHost(): boolean {
  if (typeof window === "undefined") return false;
  return LOCAL_HOSTS.has(window.location.hostname);
}

// Public app origin:
// - VITE_HELA_APP overrides all (set per Railway environment)
// - local web dev defaults to app dev server on :5174
// - production falls back to the Railway `app` service URL until a
//   custom domain is set up.
export const APP_BASE =
  env?.VITE_HELA_APP ??
  (isLocalBrowserHost()
    ? `${window.location.protocol}//${window.location.hostname}:5174`
    : "https://app-production-1716a.up.railway.app");

// Public docs origin. Same shape as APP_BASE: VITE_HELA_DOCS at
// build time wins, local web dev points at the docs vite server on
// :5175, production falls back to the Railway `docs` service URL.
export const DOCS_BASE =
  env?.VITE_HELA_DOCS ??
  (isLocalBrowserHost()
    ? `${window.location.protocol}//${window.location.hostname}:5175`
    : "https://docs-production.up.railway.app");

export const SIGNIN_URL = APP_BASE;

export function signupUrl(tier?: string): string {
  if (!tier) return `${APP_BASE}/signup`;
  return `${APP_BASE}/signup?tier=${encodeURIComponent(tier)}`;
}
