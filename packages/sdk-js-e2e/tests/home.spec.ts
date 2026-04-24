import { test, expect } from "../fixtures/base";
import {
  appUrl,
  deployedUrls,
  escapeRegExp,
  forceReconnect,
  forceTokenRefresh,
  mintPlaygroundToken,
  mockPlaygroundTokens,
  readHelaDebug,
  trackBrowserSignals,
  waitForHelaReady,
} from "../fixtures/playground";

test("landing hero connects and signup routes to the app", async ({ page }) => {
  const telemetry = trackBrowserSignals(page);

  await page.goto(appUrl("/"));
  await waitForHelaReady(page);

  await expect(page.getByText(/connected · region: ams/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /\[ start free \]/i }).first()).toHaveAttribute(
    "href",
    new RegExp(`^${escapeRegExp(deployedUrls.app)}/signup$`),
  );

  await page.waitForTimeout(3_000);

  const debug = await readHelaDebug(page);
  expect(debug.ready).toBe(true);
  expect(debug.channelJoined).toBe(true);
  expect(debug.region).toBe("ams");
  expect(debug.reconnects).toBeLessThanOrEqual(1);
  expect(telemetry.consoleErrors).toEqual([]);
  expect(telemetry.reconnectLogs).toEqual([]);
  expect(telemetry.webSocketUrls.filter((url) => url.includes("/socket/websocket"))).toHaveLength(1);
});

test("landing session refreshes the playground token and reconnects cleanly", async ({ page }) => {
  const calls = await mockPlaygroundTokens(page, [
    await mintPlaygroundToken(`playwright-first-${Date.now()}`),
    await mintPlaygroundToken(`playwright-second-${Date.now()}`),
  ]);
  const telemetry = trackBrowserSignals(page);

  await page.goto(appUrl("/"));
  await waitForHelaReady(page);

  const before = await readHelaDebug(page);
  expect(calls()).toBe(1);

  await forceTokenRefresh(page);
  await expect.poll(calls).toBe(2);

  await forceReconnect(page);
  await page.waitForFunction(
    () => window.__helaReady === true && (window.__helaDebug?.socketOpens ?? 0) >= 2,
    undefined,
    { timeout: 15_000 },
  );

  const after = await readHelaDebug(page);
  expect(after.ready).toBe(true);
  expect(after.tokenRefreshes).toBeGreaterThan(before.tokenRefreshes);
  expect(after.socketOpens).toBeGreaterThanOrEqual(2);
  expect(after.reconnects).toBeLessThanOrEqual(before.reconnects + 1);
  expect(telemetry.consoleErrors).toEqual([]);
  expect(telemetry.reconnectLogs).toEqual([]);
});
