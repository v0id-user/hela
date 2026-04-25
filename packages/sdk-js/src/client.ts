import { Socket } from "phoenix";
import { Region, wsUrl, httpUrl } from "./regions.js";
import { HelaChannel } from "./channel.js";

type HelaTokenSource = string | (() => string);

export interface HelaConfig {
  /** Which region's cluster to talk to. SDK resolves the WS endpoint. */
  region: Region;
  /**
   * A JWT grant signed by your backend. The canonical auth path —
   * your backend signs a short-lived token scoped to the channels
   * and user you want. Pass as a string, or a synchronous getter if
   * your app rotates the token outside the SDK.
   */
  token?: HelaTokenSource;
  /**
   * For the public landing-page playground only. HS256 token signed
   * by hela's playground secret, scoped to the `proj_public` sandbox.
   * Minted anonymously via `POST /playground/token`; see
   * `issuePlaygroundToken()` in this package. Like `token`, this can
   * be a string or a synchronous getter if you refresh it externally.
   */
  playgroundToken?: HelaTokenSource;
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

    this.socket = new Socket(wsUrl(config.region, config.endpoint), {
      // phoenix.js re-evaluates params() on reconnect, so as long as the
      // sources below return current auth state, reconnects reuse fresh creds.
      params: () => currentSocketParams(this.config),
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
   * Replace the current customer JWT. Useful when your app rotates auth
   * outside the SDK and wants reconnects to pick up the latest value.
   */
  setToken(token?: string): this {
    this.config.token = token;
    return this;
  }

  /**
   * Replace the current playground JWT. The landing page uses this when
   * its short-lived guest token is refreshed in the background.
   */
  setPlaygroundToken(token?: string): this {
    this.config.playgroundToken = token;
    return this;
  }

  onOpen(callback: () => void): () => void {
    const ref = this.socket.onOpen(() => callback());
    return () => this.socket.off([ref]);
  }

  onClose(callback: (event?: unknown) => void): () => void {
    const ref = this.socket.onClose((event: unknown) => callback(event));
    return () => this.socket.off([ref]);
  }

  onError(callback: (error?: unknown) => void): () => void {
    const ref = this.socket.onError((error: unknown) => callback(error));
    return () => this.socket.off([ref]);
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
   *
   * Phoenix's `Push.receive("ok", cb)` registers a callback and returns
   * the same Push synchronously — it does not return a Promise. So the
   * earlier `await channel.raw.push(...).receive("ok", () => {})` was
   * resolving immediately, reporting RTT ≈ 0ms. Wrap in a real promise
   * that the receive callbacks resolve (or reject on error/timeout).
   */
  async measureRTT(channel: HelaChannel): Promise<number> {
    const t0 = performance.now();
    return new Promise<number>((resolve, reject) => {
      channel.raw
        .push("ping", { t: t0 })
        .receive("ok", () => resolve(performance.now() - t0))
        .receive("error", (err: unknown) => reject(new Error(`ping error: ${JSON.stringify(err)}`)))
        .receive("timeout", () => reject(new Error("ping timeout")));
    });
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
    const tok = readTokenSource(this.config.token);
    const pg = readTokenSource(this.config.playgroundToken);
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

function currentSocketParams(config: HelaConfig): Record<string, string> {
  const params: Record<string, string> = {};
  const token = readTokenSource(config.token);
  const playground = readTokenSource(config.playgroundToken);
  if (token) params.token = token;
  if (playground) params.playground = playground;
  return params;
}

function readTokenSource(source?: HelaTokenSource): string | undefined {
  if (!source) return undefined;
  if (typeof source === "string") return source;

  try {
    return source();
  } catch (error) {
    console.error("[hela sdk] token source failed", error);
    return undefined;
  }
}
