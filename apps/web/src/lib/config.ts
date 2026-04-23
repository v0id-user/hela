// Dev default: gateway on :4001 (control is on :4000). In prod, swap
// to the region you host the public playground on (iad is the canonical
// one). `VITE_HELA_API` overrides — set it on vercel/fly builds.
export const API_BASE =
  (import.meta as { env?: { VITE_HELA_API?: string } }).env?.VITE_HELA_API ??
  "http://localhost:4001";

export const WS_BASE = API_BASE.replace(/^http/, "ws");

export const IS_DEV = API_BASE.includes("localhost");
