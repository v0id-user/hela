import { connect, HelaClient, issuePlaygroundToken } from "@hela/sdk";
import { API_BASE, IS_DEV } from "./config";

/** Non-ephemeral playground socket for `demo:*` panels (history, presence, etc.). */
let demoSingleton: HelaClient | null = null;
/** Ephemeral playground socket for the landing hero (`hello:world` broadcast-only). */
let heroSingleton: HelaClient | null = null;

let heroSocketHooksInstalled = false;
let demoSocketHooksInstalled = false;

// `needsTokenRefresh` returns true when the cached token is within
// this many ms of its server-side `exp` claim. The reactive close
// handler uses this to decide whether the in-memory token is fresh
// enough for the next reconnect or whether to refetch first.
const TOKEN_REFRESH_LEEWAY_MS = 60_000;

type TokenState = {
  token: string | null;
  expiresAtMs: number;
  refreshInFlight: Promise<string> | null;
};

type HelaDebugState = {
  ready: boolean;
  tokenStatus: "idle" | "refreshing" | "ready" | "error";
  tokenExpiresAt: number | null;
  tokenRefreshes: number;
  socketOpens: number;
  socketCloses: number;
  socketErrors: number;
  reconnects: number;
  channelJoined: boolean;
  heroJoinCount: number;
  region: string | null;
  rttMs: number | null;
  lastError: string | null;
};

type HelaDebugHandle = HelaDebugState & {
  forceTokenRefresh: () => Promise<void>;
  forceReconnect: () => void;
};

declare global {
  interface Window {
    __helaReady?: boolean;
    __helaDebug?: HelaDebugHandle;
  }
}

const demoTokenState: TokenState = {
  token: null,
  expiresAtMs: 0,
  refreshInFlight: null,
};

const heroTokenState: TokenState = {
  token: null,
  expiresAtMs: 0,
  refreshInFlight: null,
};

/**
 * Returns the shared non-ephemeral playground client used by the `demo:*`
 * primitive panels (history, presence, sequencing, etc.).
 */
export async function ensureClient(): Promise<HelaClient> {
  const token = await ensureDemoFreshToken();

  if (demoSingleton) {
    demoSingleton.setPlaygroundToken(token);
    demoSingleton.connect();
    return demoSingleton;
  }

  demoSingleton = connect({
    region: IS_DEV ? "dev" : "iad",
    playgroundToken: token,
    endpoint: API_BASE,
  });
  installDemoSocketHooks(demoSingleton);
  return demoSingleton;
}

/**
 * Returns the hero-only ephemeral playground client (`hello:world`).
 * Join/history are broadcast-only; no replay from cache or Postgres.
 */
export async function ensureHeroClient(): Promise<HelaClient> {
  const token = await ensureHeroFreshToken();

  if (heroSingleton) {
    heroSingleton.setPlaygroundToken(token);
    heroSingleton.connect();
    return heroSingleton;
  }

  heroSingleton = connect({
    region: IS_DEV ? "dev" : "iad",
    playgroundToken: token,
    endpoint: API_BASE,
  });
  installHeroSocketHooks(heroSingleton);
  return heroSingleton;
}

export function resetClient(): void {
  if (demoSingleton) demoSingleton.disconnect();
  if (heroSingleton) heroSingleton.disconnect();
  demoSingleton = null;
  heroSingleton = null;
  heroSocketHooksInstalled = false;
  demoSocketHooksInstalled = false;
  demoTokenState.token = null;
  demoTokenState.expiresAtMs = 0;
  demoTokenState.refreshInFlight = null;
  heroTokenState.token = null;
  heroTokenState.expiresAtMs = 0;
  heroTokenState.refreshInFlight = null;
  resetDebugState();
}

export function noteHeroJoined(region: string): void {
  const debug = debugState();
  updateDebugState({
    channelJoined: true,
    heroJoinCount: debug.heroJoinCount + 1,
    region,
    ready: true,
    lastError: null,
  });
}

export function noteHeroRTT(rttMs: number): void {
  updateDebugState({ rttMs, ready: true });
}

export function noteHeroError(error: unknown): void {
  updateDebugState({ lastError: describeError(error), ready: false });
}

async function ensureDemoFreshToken(force = false): Promise<string> {
  if (!force && demoTokenState.token && !needsTokenRefresh(demoTokenState))
    return demoTokenState.token;
  if (demoTokenState.refreshInFlight) return demoTokenState.refreshInFlight;

  demoTokenState.refreshInFlight = (async () => {
    const { token, expires_in } = await issuePlaygroundToken({
      endpoint: API_BASE,
      sub: localSubId(),
    });
    const expiresAtMs = readJwtExpiryMs(token) ?? Date.now() + expires_in * 1000;
    demoTokenState.token = token;
    demoTokenState.expiresAtMs = expiresAtMs;
    if (demoSingleton) demoSingleton.setPlaygroundToken(token);
    return token;
  })()
    .catch((error) => {
      updateDebugState({
        tokenStatus: "error",
        lastError: describeError(error),
        ready: false,
      });
      throw error;
    })
    .finally(() => {
      demoTokenState.refreshInFlight = null;
    });

  return demoTokenState.refreshInFlight;
}

async function ensureHeroFreshToken(force = false): Promise<string> {
  if (!force && heroTokenState.token && !needsTokenRefresh(heroTokenState))
    return heroTokenState.token;
  if (heroTokenState.refreshInFlight) return heroTokenState.refreshInFlight;

  updateDebugState({ tokenStatus: "refreshing" });
  heroTokenState.refreshInFlight = (async () => {
    const { token, expires_in } = await issuePlaygroundToken({
      endpoint: API_BASE,
      sub: localSubId(),
      ephemeral: true,
    });
    const expiresAtMs = readJwtExpiryMs(token) ?? Date.now() + expires_in * 1000;
    heroTokenState.token = token;
    heroTokenState.expiresAtMs = expiresAtMs;
    if (heroSingleton) heroSingleton.setPlaygroundToken(token);
    updateDebugState({
      tokenStatus: "ready",
      tokenExpiresAt: expiresAtMs,
      tokenRefreshes: debugState().tokenRefreshes + 1,
      lastError: null,
    });
    return token;
  })()
    .catch((error) => {
      updateDebugState({
        tokenStatus: "error",
        lastError: describeError(error),
        ready: false,
      });
      throw error;
    })
    .finally(() => {
      heroTokenState.refreshInFlight = null;
    });

  return heroTokenState.refreshInFlight;
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

function installHeroSocketHooks(client: HelaClient): void {
  if (heroSocketHooksInstalled) return;
  heroSocketHooksInstalled = true;

  client.onOpen(() => {
    const debug = debugState();
    updateDebugState({
      socketOpens: debug.socketOpens + 1,
      ready: debug.channelJoined,
    });
  });

  client.onClose((event: unknown) => {
    const debug = debugState();
    updateDebugState({
      socketCloses: debug.socketCloses + 1,
      reconnects: debug.socketOpens > 0 ? debug.reconnects + 1 : debug.reconnects,
      ready: false,
      lastError: describeCloseEvent(event),
    });
    if (needsTokenRefresh(heroTokenState)) void ensureHeroFreshToken(true);
  });

  client.onError((error: unknown) => {
    const debug = debugState();
    updateDebugState({
      socketErrors: debug.socketErrors + 1,
      ready: false,
      lastError: describeError(error),
    });
    if (needsTokenRefresh(heroTokenState)) void ensureHeroFreshToken(true);
  });
}

function installDemoSocketHooks(client: HelaClient): void {
  if (demoSocketHooksInstalled) return;
  demoSocketHooksInstalled = true;

  client.onClose(() => {
    if (needsTokenRefresh(demoTokenState)) void ensureDemoFreshToken(true);
  });

  client.onError(() => {
    if (needsTokenRefresh(demoTokenState)) void ensureDemoFreshToken(true);
  });
}

// Token refresh is reactive, not proactive.
//
// Phoenix only validates the JWT at WebSocket handshake. Once the
// socket is open, the server never re-checks the token, so a token
// rotation while the WS is healthy serves no purpose other than
// burning a control plane round trip. We used to schedule a setTimeout
// per-token to refresh just before expiry, which on an idle marketing
// page produced ~12 wasted requests/hour per visitor for tokens nobody
// would ever actually use.
//
// Reactive design: refresh on `onClose` / `onError` only. The handlers
// are wired in `installHeroSocketHooks` / `installDemoSocketHooks`.
// Phoenix.js's reconnect retries with backoff (10ms, 50ms, 100ms, …),
// so even if the disconnect-triggered fetch isn't finished by the
// first retry, it finishes by the second or third — well within the
// reconnect window. The user-visible cost is one bonus failed retry
// in the worst case; the user-visible benefit is zero refreshes when
// the socket is healthy (the common case).
//
// If you need proactive refresh later for a reason (e.g. polling an
// HTTP endpoint that checks the same token), reintroduce it here, not
// per-callsite. Don't pile timers on multiple layers.

function needsTokenRefresh(state: TokenState, now = Date.now()): boolean {
  if (!state.token) return true;
  return now >= state.expiresAtMs - TOKEN_REFRESH_LEEWAY_MS;
}

function readJwtExpiryMs(jwt: string): number | null {
  try {
    const [, b64] = jwt.split(".");
    const json = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
    const claims = JSON.parse(json) as { exp?: number };
    return typeof claims.exp === "number" ? claims.exp * 1000 : null;
  } catch {
    return null;
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error == null) return "unknown error";
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function describeCloseEvent(event: unknown): string {
  if (event && typeof event === "object" && "code" in event) {
    const closeEvent = event as { code?: number; reason?: string };
    return `socket closed${closeEvent.code ? ` (${closeEvent.code})` : ""}${
      closeEvent.reason ? `: ${closeEvent.reason}` : ""
    }`;
  }
  return "socket closed";
}

function debugState(): HelaDebugHandle {
  if (typeof window === "undefined") {
    return {
      ready: false,
      tokenStatus: "idle",
      tokenExpiresAt: null,
      tokenRefreshes: 0,
      socketOpens: 0,
      socketCloses: 0,
      socketErrors: 0,
      reconnects: 0,
      channelJoined: false,
      heroJoinCount: 0,
      region: null,
      rttMs: null,
      lastError: null,
      forceTokenRefresh: async () => {},
      forceReconnect: () => {},
    };
  }

  if (!window.__helaDebug) {
    window.__helaDebug = {
      ready: false,
      tokenStatus: "idle",
      tokenExpiresAt: null,
      tokenRefreshes: 0,
      socketOpens: 0,
      socketCloses: 0,
      socketErrors: 0,
      reconnects: 0,
      channelJoined: false,
      heroJoinCount: 0,
      region: null,
      rttMs: null,
      lastError: null,
      forceTokenRefresh: async () => {
        await ensureHeroFreshToken(true);
      },
      forceReconnect: () => {
        if (!heroSingleton) return;
        updateDebugState({ ready: false });
        heroSingleton.disconnect();
        heroSingleton.connect();
      },
    };
    window.__helaReady = false;
  }

  return window.__helaDebug;
}

function updateDebugState(patch: Partial<HelaDebugState>): void {
  if (typeof window === "undefined") return;
  Object.assign(debugState(), patch);
  window.__helaReady = debugState().ready;
}

function resetDebugState(): void {
  if (typeof window === "undefined" || !window.__helaDebug) return;
  const forceTokenRefresh = window.__helaDebug.forceTokenRefresh;
  const forceReconnect = window.__helaDebug.forceReconnect;
  window.__helaDebug = {
    ready: false,
    tokenStatus: "idle",
    tokenExpiresAt: null,
    tokenRefreshes: 0,
    socketOpens: 0,
    socketCloses: 0,
    socketErrors: 0,
    reconnects: 0,
    channelJoined: false,
    heroJoinCount: 0,
    region: null,
    rttMs: null,
    lastError: null,
    forceTokenRefresh,
    forceReconnect,
  };
  window.__helaReady = false;
}
