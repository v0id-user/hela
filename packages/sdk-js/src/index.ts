export { HelaClient, connect } from "./client.js";
export { HelaChannel } from "./channel.js";
export { HelaPresence } from "./presence.js";
export { REGIONS, wsUrl, httpUrl } from "./regions.js";
export type { HelaConfig } from "./client.js";
export type { Message, HistoryReply, JoinReply } from "./channel.js";
export type { PresenceEntry } from "./presence.js";
export type { Region } from "./regions.js";

/**
 * Issue a playground guest token against a hela server. Useful for local
 * dev and the landing-page demos.
 *
 *   const { token } = await issuePlaygroundToken({ endpoint: "http://localhost:4000" });
 *   const client = connect({ region: "dev", playgroundToken: token });
 */
export async function issuePlaygroundToken(opts?: {
  endpoint?: string;
  sub?: string;
}): Promise<{ token: string; project_id: string; expires_in: number }> {
  const base = opts?.endpoint ?? "https://gateway-production-bfdf.up.railway.app";
  const res = await fetch(`${base}/playground/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sub: opts?.sub }),
  });

  if (!res.ok) throw new Error(`playground/token failed: ${res.status}`);
  return res.json();
}
