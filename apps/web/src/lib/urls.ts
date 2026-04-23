const env = (import.meta as { env?: { VITE_HELA_APP?: string } }).env;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isLocalBrowserHost(): boolean {
  if (typeof window === "undefined") return false;
  return LOCAL_HOSTS.has(window.location.hostname);
}

// Public app origin:
// - VITE_HELA_APP overrides all
// - local web dev defaults to app dev server on :5174
// - production defaults to app.hela.dev
export const APP_BASE =
  env?.VITE_HELA_APP ??
  (isLocalBrowserHost()
    ? `${window.location.protocol}//${window.location.hostname}:5174`
    : "https://app.hela.dev");

export const SIGNIN_URL = APP_BASE;

export function signupUrl(tier?: string): string {
  if (!tier) return `${APP_BASE}/signup`;
  return `${APP_BASE}/signup?tier=${encodeURIComponent(tier)}`;
}
