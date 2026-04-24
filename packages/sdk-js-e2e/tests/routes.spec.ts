import { test, expect } from "../fixtures/base";
import { appUrl, trackBrowserSignals } from "../fixtures/playground";

test("status, how, and dashboard render on the launch path", async ({ page }) => {
  const telemetry = trackBrowserSignals(page);

  await page.goto(appUrl("/status"));
  await expect(page.getByText(/system status/i)).toBeVisible();
  await expect(page.getByText(/control · account \+ project api/i)).toBeVisible();
  await expect(page.getByText(/ams · Amsterdam/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: /all systems operational\./i })).toBeVisible();

  await page.goto(appUrl("/how"));
  await expect(page.getByRole("heading", { name: /how hela works/i })).toBeVisible();

  await page.goto(appUrl("/dashboard"));
  await expect(page.getByText(/\/dashboard · live state of the public hela cluster/i)).toBeVisible();
  await expect(page.getByText(/msgs\/sec in/i)).toBeVisible();

  await page.waitForTimeout(2_000);

  expect(telemetry.consoleErrors).toEqual([]);
  expect(telemetry.reconnectLogs).toEqual([]);
});
