import { Socket } from "phoenix";
import { Region, wsUrl, httpUrl } from "./regions.js";
import { HelaChannel } from "./channel.js";

export interface HelaConfig {
  /** Which region's cluster to talk to. SDK resolves the WS endpoint. */
  region: Region;
  /**
   * A JWT grant signed by your backend. The canonical auth path —
   * your backend signs a short-lived token scoped to the channels
   * and user you want. Pass as a string or a getter for auto-rotation.
   */
  token?: string | (() => Promise<string> | string);
  /**
   * For the public `hela.dev` landing-page playground only. HS256
   * token signed by `hela`'s playground secret, scoped to the
   * public sandbox project.
   */
  playgroundToken?: string;
  /** Override the WS/HTTP endpoint. Useful for local dev and tests. */
  endpoint?: string;
  /** How long to wait for reconnect attempts, in ms. Default 10000. */
  reconnectAfterMs?: (tries: number) => number;
}

/**
 * Open a socket to hela. Does not auto-connect — call `.connect()`.
 * One socket per page is enough; use `.channel()` to subscribe to
 * additional channels.
 */
export class HelaClient {
  readonly config: HelaConfig;
  private socket: Socket;

  constructor(config: HelaConfig) {
    this.config = config;

    const params: Record<string, string> = {};
    if (config.playgroundToken) params.playground = config.playgroundToken;
    // token is resolved lazily in params()/reconnect, so we pass a thunk
    // via phoenix.js' own `params` function option.

    this.socket = new Socket(wsUrl(config.region, config.endpoint), {
      params: () => {
        const p: Record<string, string> = { ...params };
        if (typeof config.token === "string") p.token = config.token;
        // Getter-style tokens: resolve on each reconnect. phoenix.js' params
        // option can return a plain object; it calls the fn each reconnect.
        return p;
      },
      reconnectAfterMs:
        config.reconnectAfterMs ||
        ((tries) => [10, 50, 100, 150, 200, 500, 1000, 2000][tries - 1] ?? 5000),
    });
  }

  /** Open the WebSocket. Idempotent. */
  connect(): this {
    this.socket.connect();
    return this;
  }

  disconnect(cb?: () => void): void {
    this.socket.disconnect(cb);
  }

  /**
   * Subscribe to a channel. `name` is the logical name (e.g. `chat:room42`).
   * The SDK prefixes it with the project id at the WS layer so tenant
   * isolation is enforced server-side.
   */
  channel(name: string, params?: Record<string, unknown>): HelaChannel {
    const projectId = this.resolveProjectId();
    const topic = `chan:${projectId}:${name}`;
    const ch = this.socket.channel(topic, params || {});
    return new HelaChannel(ch, name, projectId);
  }

  /**
   * Measure round-trip latency to the region by sending a `ping` on any
   * joined channel. Returns ms. The channel must already be joined.
   */
  async measureRTT(channel: HelaChannel): Promise<number> {
    const t0 = performance.now();
    await channel.raw.push("ping", { t: t0 }).receive("ok", () => {}).receive("error", () => {});
    return performance.now() - t0;
  }

  /** Base HTTP URL for calling `fetch`-backed helpers against this region. */
  httpUrl(): string {
    return httpUrl(this.config.region, this.config.endpoint);
  }

  private resolveProjectId(): string {
    // The JWT's `pid` claim is the source of truth, but we can't read it
    // without decoding. For the playground token we know the answer
    // statically; for customer tokens the server ignores our topic prefix
    // choice if it doesn't match the claim, so falling back to "proj" is
    // safe — but decode if we have the token.
    const tok = typeof this.config.token === "string" ? this.config.token : null;
    const pg = this.config.playgroundToken;
    const picked = tok || pg;

    if (picked) {
      const pid = tryReadPid(picked);
      if (pid) return pid;
    }

    return "proj_public";
  }
}

function tryReadPid(jwt: string): string | null {
  try {
    const [, b64] = jwt.split(".");
    const json = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
    const claims = JSON.parse(json) as { pid?: string };
    return typeof claims.pid === "string" ? claims.pid : null;
  } catch {
    return null;
  }
}

/** Shortcut: construct and connect in one call. */
export function connect(config: HelaConfig): HelaClient {
  return new HelaClient(config).connect();
}
