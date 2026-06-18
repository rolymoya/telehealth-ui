import { randomUUID } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";

const localBaseURL = "http://127.0.0.1:3000";
const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL;
const baseURL = externalBaseURL ?? localBaseURL;
const e2eAuthToken = process.env.APOTH_E2E_AUTH_TOKEN ?? `apoth-e2e-${randomUUID()}`;
process.env.APOTH_E2E_AUTH_TOKEN = e2eAuthToken;
const isCI = Boolean(process.env.CI);
const reuseExistingServer = process.env.PLAYWRIGHT_REUSE_SERVER === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 2 : undefined,
  reporter: isCI
    ? [
        ["list"],
        ["html", { open: "never", outputFolder: "playwright-report" }],
        ["junit", { outputFile: "test-results/e2e-junit.xml" }],
        ["blob", { outputDir: "blob-report" }],
      ]
    : [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL,
    screenshot: { mode: "only-on-failure", fullPage: true },
    trace: "retain-on-failure",
    video: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: externalBaseURL
    ? undefined
    : {
        command: "npm run dev -- --hostname 127.0.0.1 --port 3000",
        env: {
          ...process.env,
          APOTH_E2E_AUTH_ENABLED: "1",
          APOTH_E2E_AUTH_TOKEN: e2eAuthToken,
        },
        reuseExistingServer,
        timeout: 120_000,
        url: localBaseURL,
      },
});
