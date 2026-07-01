import { randomUUID } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";

const localBaseURL = "http://127.0.0.1:3000";
const localPatientBaseURL = "http://127.0.0.1:5173";
const externalMarketingBaseURL =
  process.env.PLAYWRIGHT_MARKETING_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL;
const externalPatientBaseURL =
  process.env.PLAYWRIGHT_PATIENT_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL;
const marketingBaseURL = externalMarketingBaseURL ?? localBaseURL;
const patientBaseURL = externalPatientBaseURL ?? localPatientBaseURL;
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
    screenshot: { mode: "only-on-failure", fullPage: true },
    trace: "retain-on-failure",
    video: "on-first-retry",
  },
  projects: [
    {
      name: "public-chromium",
      testMatch: [
        /.*compliance-public\.spec\.ts/,
        /.*public.*\.spec\.ts/,
      ],
      use: { ...devices["Desktop Chrome"], baseURL: marketingBaseURL },
    },
    {
      name: "patient-chromium",
      testIgnore: [
        /.*compliance-public\.spec\.ts/,
        /.*public.*\.spec\.ts/,
      ],
      use: { ...devices["Desktop Chrome"], baseURL: patientBaseURL },
    },
  ],
  webServer: externalMarketingBaseURL || externalPatientBaseURL
    ? undefined
    : [
        {
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
        {
          command: "npm run patient:dev -- --host 127.0.0.1",
          env: {
            ...process.env,
            VITE_PATIENT_API_PROXY_TARGET: localBaseURL,
          },
          reuseExistingServer,
          timeout: 120_000,
          url: localPatientBaseURL,
        },
      ],
});
