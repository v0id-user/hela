export { HelaClient, connect } from "./client.js";
export { HelaChannel } from "./channel.js";
export { HelaPresence } from "./presence.js";
export { REGIONS, wsUrl, httpUrl } from "./regions.js";
export type { HelaConfig } from "./client.js";
export type { Message, HistoryReply, JoinReply } from "./channel.js";
export type { PresenceEntry } from "./presence.js";
export type { Region } from "./regions.js";

/**
 * Mint a short-lived playground JWT (`proj_public`) via `POST /playground/token`.
 *
 * **`ephemeral`** — optional; default is full history + persistence. When
 * `true`, the gateway treats the resulting JWT as **broadcast-only**: live
 * subscribers still receive messages, but join/history do not replay cache or
 * Postgres, and publishes from this token are not persisted.
 *
 * @example Full demo token (history + persistence)
 * ```ts
 * const { token } = await issuePlaygroundToken({ endpoint: "http://localhost:4000" });
 * const client = connect({ region: "dev", playgroundToken: token });
 * ```
 *
 * @example Strip or lobby that should not retain replay
 * ```ts
 * const { token } = await issuePlaygroundToken({ ephemeral: true });
 * ```
 */
export async function issuePlaygroundToken(opts?: {
  endpoint?: string;
  sub?: string;
  ephemeral?: boolean;
}): Promise<{ token: string; project_id: string; expires_in: number; ephemeral?: boolean }> {
  const base = opts?.endpoint ?? "https://gateway-production-bfdf.up.railway.app";
  const res = await fetch(`${base}/playground/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sub: opts?.sub, ephemeral: opts?.ephemeral }),
  });

  if (!res.ok) throw new Error(`playground/token failed: ${res.status}`);
  return res.json();
}
