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
  // No 429 on the legitimate first-paint pattern. The page mints two
  // playground tokens (hero ephemeral + demo non-ephemeral) within
  // the same second; the per-IP rate limiter must accommodate that
  // burst. If this fails, either the limiter tightened or the page
  // started minting more tokens than it needs.
  expect(telemetry.rateLimited).toEqual([]);
  const sockets = telemetry.webSocketUrls.filter((url) => url.includes("/socket/websocket"));
  expect(sockets.length).toBeGreaterThanOrEqual(2);
});

test("landing session refreshes the playground token and reconnects cleanly", async ({ page }) => {
  const ts = Date.now();
  const calls = await mockPlaygroundTokens(page, [
    await mintPlaygroundToken(`playwright-hero-a-${ts}`, { ephemeral: true }),
    await mintPlaygroundToken(`playwright-demo-b-${ts}`, { ephemeral: false }),
    await mintPlaygroundToken(`playwright-hero-c-${ts}`, { ephemeral: true }),
  ]);
  const telemetry = trackBrowserSignals(page);

  await page.goto(appUrl("/"));
  await waitForHelaReady(page);

  const before = await readHelaDebug(page);
  expect(calls()).toBe(2);

  await forceTokenRefresh(page);
  await expect.poll(calls).toBe(3);

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

test("hero ephemeral join does not replay seeded hello:world history", async ({ page }) => {
  test.skip(!!process.env.HELA_E2E_BASE_URL, "mock seeds hello:world only in preview");

  await page.goto(appUrl("/"));
  await waitForHelaReady(page);

  await expect(page.getByTestId("hero-channel")).not.toContainText("__e2e_seed_hello_world__");
});
