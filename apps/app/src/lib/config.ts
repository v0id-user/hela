// The customer dashboard talks to the control plane for account/project
// CRUD (port 4000 in dev), and to the gateway for live per-project
// metrics (port 4001 in dev). VITE_* overrides in prod.

export const CONTROL_BASE =
  (import.meta as { env?: { VITE_HELA_CONTROL?: string } }).env?.VITE_HELA_CONTROL ??
  "http://localhost:4000";

export const GATEWAY_BASE =
  (import.meta as { env?: { VITE_HELA_GATEWAY?: string } }).env?.VITE_HELA_GATEWAY ??
  "http://localhost:4001";
