import { HOSTED_ENDPOINTS } from "@hela/config/hosted";

const env = (import.meta as { env?: { DEV?: boolean; VITE_HELA_API?: string } }).env;

// Dev default: gateway on :4001 (control is on :4000). Production
// defaults to the hosted gateway so a static bundle built without
// Railway/Vite env vars does not ship localhost URLs.
export const API_BASE =
  envUrl(env?.VITE_HELA_API) ??
  (env?.DEV ? "http://localhost:4001" : HOSTED_ENDPOINTS.production.gateway);

export const WS_BASE = API_BASE.replace(/^http/, "ws");

export const IS_DEV = API_BASE.includes("localhost");

function envUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
