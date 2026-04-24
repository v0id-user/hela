import { connect, HelaClient, issuePlaygroundToken } from "@hela/sdk";
import { API_BASE, IS_DEV } from "./config";

/** Non-ephemeral playground socket for `demo:*` panels (history, presence, etc.). */
let demoSingleton: HelaClient | null = null;
/** Ephemeral playground socket for the landing hero (`hello:world` broadcast-only). */
let heroSingleton: HelaClient | null = null;

let heroSocketHooksInstalled = false;
let demoSocketHooksInstalled = false;
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

const demoTokenState: TokenState = {
  token: null,
  expiresAtMs: 0,
  refreshInFlight: null,
  refreshTimer: null,
};

const heroTokenState: TokenState = {
  token: null,
  expiresAtMs: 0,
  refreshInFlight: null,
  refreshTimer: null,
};

/**
 * Returns the shared non-ephemeral playground client used by the `demo:*`
 * primitive panels (history, presence, sequencing, etc.).
 */
export async function ensureClient(): Promise<HelaClient> {
  installLifecycleHooks();
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
  installLifecycleHooks();
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
  clearDemoRefreshTimer();
  heroTokenState.token = null;
  heroTokenState.expiresAtMs = 0;
  heroTokenState.refreshInFlight = null;
  clearHeroRefreshTimer();
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
    scheduleDemoRefresh();
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
    scheduleHeroRefresh();
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

function installLifecycleHooks(): void {
  if (lifecycleHooksInstalled || typeof window === "undefined") return;
  lifecycleHooksInstalled = true;

  const refreshIfNeeded = () => {
    if (heroSingleton && needsTokenRefresh(heroTokenState)) void ensureHeroFreshToken(true);
    if (demoSingleton && needsTokenRefresh(demoTokenState)) void ensureDemoFreshToken(true);
  };

  window.addEventListener("focus", refreshIfNeeded);
  window.addEventListener("online", refreshIfNeeded);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshIfNeeded();
  });
}

function scheduleHeroRefresh(): void {
  if (typeof window === "undefined") return;
  clearHeroRefreshTimer();
  if (!heroTokenState.expiresAtMs) return;

  const waitMs = Math.max(1_000, heroTokenState.expiresAtMs - Date.now() - TOKEN_REFRESH_LEEWAY_MS);
  heroTokenState.refreshTimer = window.setTimeout(() => {
    void ensureHeroFreshToken(true);
  }, waitMs);
}

function clearHeroRefreshTimer(): void {
  if (!heroTokenState.refreshTimer) return;
  clearTimeout(heroTokenState.refreshTimer);
  heroTokenState.refreshTimer = null;
}

function scheduleDemoRefresh(): void {
  if (typeof window === "undefined") return;
  clearDemoRefreshTimer();
  if (!demoTokenState.expiresAtMs) return;

  const waitMs = Math.max(1_000, demoTokenState.expiresAtMs - Date.now() - TOKEN_REFRESH_LEEWAY_MS);
  demoTokenState.refreshTimer = window.setTimeout(() => {
    void ensureDemoFreshToken(true);
  }, waitMs);
}

function clearDemoRefreshTimer(): void {
  if (!demoTokenState.refreshTimer) return;
  clearTimeout(demoTokenState.refreshTimer);
  demoTokenState.refreshTimer = null;
}

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
