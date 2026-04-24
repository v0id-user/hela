import { connect, HelaClient, issuePlaygroundToken } from "@hela/sdk";
import { API_BASE, IS_DEV } from "./config";

let singleton: HelaClient | null = null;
let socketHooksInstalled = false;
let lifecycleHooksInstalled = false;

const TOKEN_REFRESH_LEEWAY_MS = 60_000;

type TokenState = {
  token: string | null;
  expiresAtMs: number;
  refreshInFlight: Promise<string> | null;
  refreshTimer: ReturnType<typeof setTimeout> | null;
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

const tokenState: TokenState = {
  token: null,
  expiresAtMs: 0,
  refreshInFlight: null,
  refreshTimer: null,
};

/**
 * Returns a connected HelaClient bound to a fresh playground token.
 * Token lives 5 minutes; we keep it fresh in the background. Every
 * demo on the landing page reuses this one socket.
 */
export async function ensureClient(): Promise<HelaClient> {
  installLifecycleHooks();
  const token = await ensureFreshToken();

  if (singleton) {
    singleton.setPlaygroundToken(token);
    singleton.connect();
    return singleton;
  }

  singleton = connect({ region: IS_DEV ? "dev" : "iad", playgroundToken: token, endpoint: API_BASE });
  installSocketHooks(singleton);
  return singleton;
}

export function resetClient(): void {
  if (singleton) singleton.disconnect();
  singleton = null;
  socketHooksInstalled = false;
  tokenState.token = null;
  tokenState.expiresAtMs = 0;
  tokenState.refreshInFlight = null;
  clearRefreshTimer();
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

async function ensureFreshToken(force = false): Promise<string> {
  if (!force && tokenState.token && !needsTokenRefresh()) return tokenState.token;
  if (tokenState.refreshInFlight) return tokenState.refreshInFlight;

  updateDebugState({ tokenStatus: "refreshing" });
  tokenState.refreshInFlight = (async () => {
    const { token, expires_in } = await issuePlaygroundToken({
      endpoint: API_BASE,
      sub: localSubId(),
    });
    const expiresAtMs = readJwtExpiryMs(token) ?? Date.now() + expires_in * 1000;
    tokenState.token = token;
    tokenState.expiresAtMs = expiresAtMs;
    if (singleton) singleton.setPlaygroundToken(token);
    scheduleRefresh();
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
      tokenState.refreshInFlight = null;
    });

  return tokenState.refreshInFlight;
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

function installSocketHooks(client: HelaClient): void {
  if (socketHooksInstalled) return;
  socketHooksInstalled = true;

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
    if (needsTokenRefresh()) void ensureFreshToken(true);
  });

  client.onError((error: unknown) => {
    const debug = debugState();
    updateDebugState({
      socketErrors: debug.socketErrors + 1,
      ready: false,
      lastError: describeError(error),
    });
    if (needsTokenRefresh()) void ensureFreshToken(true);
  });
}

function installLifecycleHooks(): void {
  if (lifecycleHooksInstalled || typeof window === "undefined") return;
  lifecycleHooksInstalled = true;

  const refreshIfNeeded = () => {
    if (!singleton) return;
    if (needsTokenRefresh()) void ensureFreshToken(true);
  };

  window.addEventListener("focus", refreshIfNeeded);
  window.addEventListener("online", refreshIfNeeded);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshIfNeeded();
  });
}

function scheduleRefresh(): void {
  if (typeof window === "undefined") return;
  clearRefreshTimer();
  if (!tokenState.expiresAtMs) return;

  const waitMs = Math.max(1_000, tokenState.expiresAtMs - Date.now() - TOKEN_REFRESH_LEEWAY_MS);
  tokenState.refreshTimer = window.setTimeout(() => {
    void ensureFreshToken(true);
  }, waitMs);
}

function clearRefreshTimer(): void {
  if (!tokenState.refreshTimer) return;
  clearTimeout(tokenState.refreshTimer);
  tokenState.refreshTimer = null;
}

function needsTokenRefresh(now = Date.now()): boolean {
  if (!tokenState.token) return true;
  return now >= tokenState.expiresAtMs - TOKEN_REFRESH_LEEWAY_MS;
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
        await ensureFreshToken(true);
      },
      forceReconnect: () => {
        if (!singleton) return;
        updateDebugState({ ready: false });
        singleton.disconnect();
        singleton.connect();
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
