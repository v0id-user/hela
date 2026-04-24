import type { Page } from "@playwright/test";
import { issuePlaygroundToken } from "@hela/sdk";

const DEFAULT_GATEWAY_URL = process.env.HELA_E2E_BASE_URL
  ? "https://gateway-production-bfdf.up.railway.app"
  : "http://127.0.0.1:4010";
const DEFAULT_CONTROL_URL = process.env.HELA_E2E_BASE_URL
  ? "https://control-production-059e.up.railway.app"
  : "http://127.0.0.1:4010";
const DEFAULT_APP_URL = "https://app-production-1716a.up.railway.app";
const PREVIEW_BASE_URL = "http://127.0.0.1:4173";

export const deployedUrls = {
  gateway: process.env.HELA_GATEWAY_URL ?? DEFAULT_GATEWAY_URL,
  control: process.env.HELA_CONTROL_URL ?? DEFAULT_CONTROL_URL,
  app: process.env.HELA_APP_URL ?? DEFAULT_APP_URL,
};

export function appUrl(path = "/"): string {
  return new URL(path, process.env.HELA_E2E_BASE_URL ?? PREVIEW_BASE_URL).toString();
}

export type HelaDebugSnapshot = {
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

type PlaygroundTokenResponse = Awaited<ReturnType<typeof issuePlaygroundToken>>;

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

export async function mintPlaygroundToken(
  sub: string,
  opts?: { ephemeral?: boolean },
): Promise<PlaygroundTokenResponse> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      return await issuePlaygroundToken({
        endpoint: deployedUrls.gateway,
        sub,
        ephemeral: opts?.ephemeral,
      });
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("429") || attempt === 5) break;
      await new Promise((resolve) => setTimeout(resolve, 1_100));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function mockPlaygroundTokens(
  page: Page,
  tokens: PlaygroundTokenResponse[],
): Promise<() => number> {
  let calls = 0;

  await page.route("**/playground/token", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }

    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }

    const next = tokens[calls];
    if (!next) {
      await route.fallback();
      return;
    }

    calls += 1;
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json", ...corsHeaders },
      body: JSON.stringify(next),
    });
  });

  return () => calls;
}

export function trackBrowserSignals(page: Page): {
  consoleErrors: string[];
  reconnectLogs: string[];
  webSocketUrls: string[];
} {
  const consoleErrors: string[] = [];
  const reconnectLogs: string[] = [];
  const webSocketUrls: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
    if (/reconnect/i.test(message.text())) reconnectLogs.push(message.text());
  });

  page.on("websocket", (ws) => {
    webSocketUrls.push(ws.url());
  });

  return { consoleErrors, reconnectLogs, webSocketUrls };
}

export async function waitForHelaReady(page: Page, timeout = 10_000): Promise<void> {
  await page.waitForFunction(() => window.__helaReady === true, undefined, { timeout });
}

export async function readHelaDebug(page: Page): Promise<HelaDebugSnapshot> {
  return page.evaluate(() => {
    if (!window.__helaDebug) throw new Error("hela debug probe missing");

    return {
      ready: window.__helaReady === true,
      tokenStatus: window.__helaDebug.tokenStatus,
      tokenExpiresAt: window.__helaDebug.tokenExpiresAt,
      tokenRefreshes: window.__helaDebug.tokenRefreshes,
      socketOpens: window.__helaDebug.socketOpens,
      socketCloses: window.__helaDebug.socketCloses,
      socketErrors: window.__helaDebug.socketErrors,
      reconnects: window.__helaDebug.reconnects,
      channelJoined: window.__helaDebug.channelJoined,
      heroJoinCount: window.__helaDebug.heroJoinCount,
      region: window.__helaDebug.region,
      rttMs: window.__helaDebug.rttMs,
      lastError: window.__helaDebug.lastError,
    };
  });
}

export async function forceTokenRefresh(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await window.__helaDebug?.forceTokenRefresh();
  });
}

export async function forceReconnect(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__helaDebug?.forceReconnect();
  });
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
