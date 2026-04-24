import { defineConfig, devices } from "@playwright/test";

const DEFAULT_GATEWAY_URL = "https://gateway-production-bfdf.up.railway.app";
const DEFAULT_CONTROL_URL = "https://control-production-059e.up.railway.app";
const DEFAULT_APP_URL = "https://app-production-1716a.up.railway.app";
const PREVIEW_READY_URL = "http://127.0.0.1:4173";
const PREVIEW_BASE_URL = "http://127.0.0.1:4173";
const MOCK_GATEWAY_URL = "http://127.0.0.1:4010";

const baseURL = process.env.HELA_E2E_BASE_URL ?? PREVIEW_BASE_URL;
const usePreview = !process.env.HELA_E2E_BASE_URL;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [["list"], ["html", { open: "never" }]],
  outputDir: "test-results",
  use: {
    baseURL,
    trace: "on-first-retry",
    video: "retain-on-failure",
  },
  webServer: usePreview
    ? [
        {
          command: "bun run mock-server",
          url: MOCK_GATEWAY_URL + "/health",
          cwd: ".",
          reuseExistingServer: !process.env.CI,
          stdout: "pipe",
          stderr: "pipe",
        },
        {
          command:
            "cd ../.. && bun run build:sdk && cd apps/web && bun run build && bunx vite preview --host 127.0.0.1 --port 4173 --strictPort",
          url: PREVIEW_READY_URL,
          reuseExistingServer: !process.env.CI,
          stdout: "pipe",
          stderr: "pipe",
          env: {
            ...process.env,
            HELA_GATEWAY_URL: MOCK_GATEWAY_URL,
            HELA_CONTROL_URL: MOCK_GATEWAY_URL,
            VITE_HELA_API: MOCK_GATEWAY_URL,
            VITE_HELA_GATEWAY: MOCK_GATEWAY_URL,
            VITE_HELA_CONTROL: MOCK_GATEWAY_URL,
            VITE_HELA_APP: process.env.HELA_APP_URL ?? DEFAULT_APP_URL,
          },
        },
      ]
    : undefined,
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});
