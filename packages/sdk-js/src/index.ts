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
  const body = JSON.stringify({ sub: opts?.sub, ephemeral: opts?.ephemeral });

  // The gateway rate-limits /playground/token at 1 req/sec per IP
  // (see Hela.PlaygroundLimiter). A fast page load + a forced refresh,
  // or two tabs minting at once, races that limit. Retry on 429 with
  // a short backoff so the browser never surfaces it as a connection
  // failure.
  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const res = await fetch(`${base}/playground/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });

    if (res.ok) return res.json();

    if (res.status === 429 && attempt < maxAttempts) {
      const retryAfter = Number(res.headers.get("retry-after")) || 0;
      const backoffMs = retryAfter > 0 ? retryAfter * 1000 : 1100 * attempt;
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
      continue;
    }

    throw new Error(`playground/token failed: ${res.status}`);
  }

  throw new Error("playground/token failed: retry budget exhausted");
}
