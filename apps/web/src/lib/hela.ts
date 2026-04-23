import { connect, HelaClient } from "@hela/sdk";
import { API_BASE, IS_DEV } from "./config";

let singleton: HelaClient | null = null;
let tokenPromise: Promise<string> | null = null;

/**
 * Returns a connected HelaClient bound to a fresh playground token.
 * Token lives 5 minutes; we re-request it lazily if needed. Every
 * demo on the landing page reuses this one socket.
 */
export async function ensureClient(): Promise<HelaClient> {
  if (singleton) return singleton;
  const token = await ensureToken();
  singleton = connect({
    region: IS_DEV ? "dev" : "iad",
    playgroundToken: token,
    endpoint: API_BASE,
  });
  return singleton;
}

export function resetClient(): void {
  if (singleton) singleton.disconnect();
  singleton = null;
  tokenPromise = null;
}

async function ensureToken(): Promise<string> {
  if (tokenPromise) return tokenPromise;

  tokenPromise = (async () => {
    const res = await fetch(`${API_BASE}/playground/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sub: localSubId() }),
    });

    if (!res.ok) throw new Error(`playground token failed: ${res.status}`);
    const { token } = (await res.json()) as { token: string };
    return token;
  })();

  return tokenPromise;
}

function localSubId(): string {
  const K = "hela.playground.sub";
  let id = localStorage.getItem(K);
  if (!id) {
    id = "guest_" + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(K, id);
  }
  return id;
}

/**
 * Decode the 48-bit timestamp embedded in a UUIDv7. Returns the ISO string
 * so the Sequencing demo can show it under each message.
 */
export function uuidv7Timestamp(id: string): string {
  const hex = id.replace(/-/g, "");
  const ms = parseInt(hex.slice(0, 12), 16);
  return new Date(ms).toISOString();
}
