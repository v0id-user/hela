// The customer dashboard talks to the control plane for account/project
// CRUD and to the gateway for live per-project metrics. In dev,
// control API calls stay same-origin through the Vite proxy. In prod,
// default to hosted URLs so a static bundle built without Railway/Vite
// env vars does not ship localhost or same-origin API assumptions.

const env = (
  import.meta as {
    env?: { DEV?: boolean; VITE_HELA_CONTROL?: string; VITE_HELA_GATEWAY?: string };
  }
).env;

export const CONTROL_BASE =
  env?.VITE_HELA_CONTROL ?? (env?.DEV ? "" : "https://control-production-059e.up.railway.app");

export const GATEWAY_BASE =
  env?.VITE_HELA_GATEWAY ??
  (env?.DEV ? "http://localhost:4001" : "https://gateway-production-bfdf.up.railway.app");
