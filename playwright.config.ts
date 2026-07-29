import { randomUUID } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";

const localMarketingPort = process.env.PLAYWRIGHT_LOCAL_MARKETING_PORT ?? "3100";
const localPatientPort = process.env.PLAYWRIGHT_LOCAL_PATIENT_PORT ?? "5174";
const localBaseURL = `http://127.0.0.1:${localMarketingPort}`;
const localPatientBaseURL = `http://127.0.0.1:${localPatientPort}`;
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
      testMatch: [/.*commerce-funnel\.spec\.ts/],
      use: { ...devices["Desktop Chrome"], baseURL: patientBaseURL },
    },
  ],
  webServer: externalMarketingBaseURL || externalPatientBaseURL
    ? undefined
    : [
        {
          command: `npm run start -- --hostname 127.0.0.1 --port ${localMarketingPort}`,
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
          command: `npm run patient:dev -- --host 127.0.0.1 --port ${localPatientPort}`,
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
