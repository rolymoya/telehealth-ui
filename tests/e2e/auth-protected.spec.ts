import { expect, test } from "@playwright/test";
import { patientAccessCookieName } from "../../src/lib/auth/session-cookie";
import { e2eAuthHeaderName } from "../../src/lib/e2e-auth";
import {
  collectUnexpectedPageErrors,
  expectPublicRouteReady,
} from "./support/public";

const e2eAuthToken = process.env.APOTH_E2E_AUTH_TOKEN;

if (!e2eAuthToken) {
  throw new Error("APOTH_E2E_AUTH_TOKEN must be set by Playwright config.");
}

const authRoutes = [
  { path: "/sign-in", heading: "Sign in to continue." },
  { path: "/sign-up", heading: "Create your account." },
  { path: "/reset-password", heading: "Reset your password." },
  { path: "/verify-email", heading: "Verify your email." },
  { path: "/sign-out", heading: "Sign out securely." },
];

const protectedRoutes = [
  { path: "/account", heading: "Account", body: "Manage basic account settings" },
  { path: "/dashboard", heading: "Dashboard", body: "Track account, billing, and care workflow status" },
  { path: "/billing", heading: "Add a payment method without starting billing.", body: "Billing cannot activate until the selected clinical approval event is mirrored." },
  { path: "/onboarding/consent", heading: "Review telehealth and platform terms.", body: "Review telehealth consent" },
  { path: "/onboarding/mdi", heading: "MDI questionnaire", body: "opaque case pointers" },
];

test.describe("auth entry routes", () => {
  for (const route of authRoutes) {
    test(`${route.path} loads its auth shell without live Cognito`, async ({ page }) => {
      await expectPublicRouteReady(page, route.path);
      await expect(page.getByRole("heading", { name: route.heading })).toBeVisible();
    });
  }
});

test.describe("protected route gating", () => {
  for (const route of protectedRoutes) {
    test(`${route.path} redirects signed-out patients to sign in`, async ({ page }) => {
      await page.goto(route.path);

      await expect(page).toHaveURL(
        new RegExp(`/sign-in\\?returnTo=${encodeURIComponent(route.path)}$`),
      );
      await expect(
        page.getByRole("heading", { name: "Sign in to continue." }),
      ).toBeVisible();
    });
  }
});

test.describe("synthetic authenticated protected shells", () => {
  test.use({
    extraHTTPHeaders: {
      [e2eAuthHeaderName]: e2eAuthToken,
    },
  });

  for (const route of protectedRoutes) {
    test(`${route.path} renders with the local E2E auth seam`, async ({ page }) => {
      const errors = collectUnexpectedPageErrors(page);
      await page.route("**/api/dashboard", (route) =>
        route.fulfill({
          contentType: "application/json",
          body: JSON.stringify(syntheticDashboard()),
        }),
      );
      await page.route("**/api/onboarding/mdi/bootstrap", (route) =>
        route.fulfill({
          contentType: "application/json",
          status: 200,
          body: JSON.stringify({
            caseId: "mdi_case_auth_e2e",
            csrfToken: "csrf_mdi_auth_e2e",
            patientId: "mdi_patient_auth_e2e",
            questionnaireId: "questionnaire_auth_e2e",
            questions: [],
            status: "ready",
          }),
        }),
      );

      await page.goto(route.path);

      await expect(page).toHaveURL(new RegExp(`${route.path}$`));
      await expect(page.getByRole("heading", { name: route.heading })).toBeVisible();
      await expect(page.getByText(route.body)).toBeVisible();
      errors.expectNone();
    });
  }
});

test("session clear endpoint expires the HttpOnly access cookie", async ({ request }) => {
  const response = await request.delete("/api/auth/session");
  const setCookie = response.headers()["set-cookie"] ?? "";

  expect(response.ok()).toBe(true);
  expect(await response.json()).toEqual({ status: "session_cleared" });
  expect(setCookie).toContain(`${patientAccessCookieName}=`);
  expect(setCookie).toContain("Max-Age=0");
  expect(setCookie).toContain("Path=/");
  expect(setCookie).toContain("HttpOnly");
  expect(setCookie).toContain("SameSite=lax");
});

test("sign-out UI clears a browser session and restores protected-route gating", async ({
  baseURL,
  page,
}) => {
  const errors = collectUnexpectedPageErrors(page);

  await page.context().addCookies([
    {
      httpOnly: true,
      name: patientAccessCookieName,
      sameSite: "Lax",
      secure: true,
      url: (baseURL ?? "http://127.0.0.1:3000").replace("http://", "https://"),
      value: "opaque-local-e2e-session",
    },
  ]);

  await expect
    .poll(async () => {
      const cookies = await page.context().cookies();
      return cookies.some((cookie) => (
        cookie.name === patientAccessCookieName &&
        cookie.value === "opaque-local-e2e-session"
      ));
    })
    .toBe(true);

  await page.goto("/sign-out");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("status")).toContainText("Signed out.");

  await expect
    .poll(async () => {
      const cookies = await page.context().cookies();
      return cookies.some((cookie) => cookie.name === patientAccessCookieName);
    })
    .toBe(false);

  await page.goto("/dashboard");
  await expect(page).toHaveURL("/sign-in?returnTo=%2Fdashboard");
});

function syntheticDashboard() {
  return {
    account: {
      code: "manage_account",
      residencyState: "IL",
      label: "Account",
      status: "Clinical review",
    },
    actions: [],
    billing: {
      canCancel: false,
      code: "billing_pending_approval",
      label: "Billing pending",
      summary: "Billing cannot activate until the selected clinical approval event is mirrored.",
    },
    care: {
      followUp: {
        code: "action_needed_waiting",
        label: "MDI care workflow",
        summary: "Your intake is with the independent clinical group.",
        tone: "deferred",
      },
      refills: {
        code: "refills_deferred",
        label: "Refills",
        summary: "Refill requests appear after care is active.",
        tone: "deferred",
      },
    },
    caseStatus: {
      code: "case_status_clinical_review",
      label: "Clinical review",
      summary: "Your intake is with the independent clinical group.",
    },
    generatedAt: "2026-06-30T00:00:00.000Z",
    support: {
      code: "contact_support",
      label: "Contact support",
      summary: "For account or billing help, contact Apoth support.",
    },
  };
}
