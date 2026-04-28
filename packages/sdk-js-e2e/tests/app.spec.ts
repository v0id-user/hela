import { test, expect } from "../fixtures/base";
import { trackBrowserSignals } from "../fixtures/playground";

const APP_BASE_URL = process.env.HELA_APP_URL ?? "https://app-production-1716a.up.railway.app";

test("dashboard signup creates a project and API key", async ({ page }) => {
  test.setTimeout(60_000);
  test.skip(!process.env.HELA_E2E_DASHBOARD, "dashboard e2e runs only against deployed app");

  const telemetry = trackBrowserSignals(page);
  const stamp = Date.now();
  const email = `pw-dashboard-${stamp}@v0id.me`;
  const password = `pw-dashboard-${stamp}`;
  const projectName = `pw-dashboard-${stamp}`;

  await page.goto(new URL("/signup", APP_BASE_URL).toString());
  await page.getByLabel("email").fill(email);
  await page.getByLabel("password").fill(password);
  await page.getByRole("button", { name: /\[ create account \]/i }).click();

  await expect(page.getByRole("heading", { name: /projects/i })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();

  await page.getByRole("button", { name: /\[ new project \]/i }).click();
  await expect(page.getByRole("heading", { name: /new project/i })).toBeVisible();
  await page.getByPlaceholder(/my-app-chat/i).fill(projectName);
  await page.getByRole("button", { name: /\[ create project \]/i }).click();

  await expect(page.getByRole("heading", { name: projectName })).toBeVisible();
  await expect(page.getByText(/hela-issued \(default\)/i)).toBeVisible();
  await expect(page.getByText(/"sub": "alice"/i)).toBeVisible();
  await expect(page.getByText(/"chans":/i)).toBeVisible();

  await page.getByRole("button", { name: /\[ keys \]/i }).click();
  await expect(page.getByRole("heading", { name: /api keys/i })).toBeVisible();
  await page.getByPlaceholder(/label/i).fill("playwright backend");
  await page.getByRole("button", { name: /\[ new key \]/i }).click();

  await expect(page.getByText(/new key · copy now/i)).toBeVisible();
  await expect(page.locator("pre").filter({ hasText: /^hk_[a-z0-9]+_/i })).toBeVisible();

  expect(telemetry.consoleErrors.filter((line) => !line.includes("status of 401"))).toEqual([]);
});
