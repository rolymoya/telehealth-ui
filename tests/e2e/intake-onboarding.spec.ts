import { expect, test, type Route } from "@playwright/test";
import { e2eAuthHeaderName } from "../../src/lib/e2e-auth";

const e2eAuthToken = process.env.APOTH_E2E_AUTH_TOKEN;

if (!e2eAuthToken) {
  throw new Error("APOTH_E2E_AUTH_TOKEN must be set by Playwright config.");
}

test("walks privacy, precheck, passwordless verification, and portal handoff", async ({
  page,
}) => {
  let privacyAccepted = false;
  const requestBodies: Record<string, unknown>[] = [];

  await page.route("**/api/intake/bootstrap", (route) => route.fulfill({
    contentType: "application/json",
    status: privacyAccepted ? 200 : 403,
    body: JSON.stringify(privacyAccepted
      ? { csrfToken: "csrf_precheck_e2e", status: "ready_for_anonymous_precheck" }
      : { code: "privacy_notice_required" }),
  }));
  await page.route("**/api/intake/privacy-notice", async (route) => {
    privacyAccepted = true;
    requestBodies.push(JSON.parse(route.request().postData() ?? "{}"));
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ status: "privacy_notice_accepted" }),
    });
  });
  await page.route("**/api/intake/precheck", async (route) => {
    requestBodies.push(JSON.parse(route.request().postData() ?? "{}"));
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ status: "ready_for_account_creation" }),
    });
  });
  await page.route("**/api/auth/email-otp/start", async (route) => {
    expect(route.request().headers()["x-apoth-auth-intent"])
      .toBe("start-precheck-email-otp");
    requestBodies.push(JSON.parse(route.request().postData() ?? "{}"));
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        status: "verification_code_sent",
        transactionHandle: "otp_handle_e2e_0123456789",
      }),
    });
  });
  await page.route("**/api/auth/email-otp/confirm", async (route) => {
    expect(route.request().headers()["x-apoth-auth-intent"])
      .toBe("confirm-precheck-email-otp");
    requestBodies.push(JSON.parse(route.request().postData() ?? "{}"));
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ status: "account_verified" }),
    });
  });
  await page.route("**/api/onboarding/start?product=weight", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ destination: "/portal/launch", status: "ready" }),
  }));
  await page.route("**/api/dashboard", authenticatedDashboard);

  await page.goto("/intake?product=weight");
  await expect(page.getByRole("heading", { name: "Review privacy before precheck." }))
    .toBeVisible();
  await page.getByRole("checkbox", { name: /reviewed the current privacy notice/i }).check();
  await page.getByRole("button", { name: "Continue to precheck" }).click();

  await page.getByLabel("State of residence").selectOption("IL");
  await page.getByRole("spinbutton", { name: "Age" }).fill("41");
  await page.locator('input[name="emergencySymptoms"][value="no"]').check();
  await page.locator('input[name="blockingContraindication"][value="no"]').check();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "Verify your email to continue." }))
    .toBeVisible();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await page.getByLabel("Email address").fill("synthetic.patient@example.test");
  await page.getByRole("button", { name: "Email me a code" }).click();
  await page.getByLabel("Six-digit verification code").fill("123456");
  await page.setExtraHTTPHeaders({ [e2eAuthHeaderName]: e2eAuthToken });
  await page.getByRole("button", { name: "Verify and continue" }).click();

  await expect(page).toHaveURL(/\/portal\/launch$/);
  await expect(page.getByRole("heading", { name: "Continue to your medical intake." }))
    .toBeVisible();
  expect(requestBodies).toEqual(expect.arrayContaining([
    expect.objectContaining({ offering: "weight", state: "IL" }),
    { email: "synthetic.patient@example.test" },
    expect.objectContaining({ code: "123456" }),
  ]));
  const storage = await page.evaluate(() => ({
    local: JSON.stringify({ ...localStorage }),
    session: JSON.stringify({ ...sessionStorage }),
  }));
  expect(JSON.stringify(storage)).not.toMatch(/synthetic\.patient|123456|41/);
});

test("retires the legacy MDI questionnaire route", async ({ page }) => {
  await page.setExtraHTTPHeaders({ [e2eAuthHeaderName]: e2eAuthToken });
  await page.route("**/api/dashboard", authenticatedDashboard);
  let legacyApiRequests = 0;
  await page.route("**/api/onboarding/mdi/**", (route) => {
    legacyApiRequests += 1;
    return route.abort();
  });

  await page.goto("/onboarding/mdi");

  await expect(page).toHaveURL(/\/portal\/launch$/);
  await expect(page.getByRole("heading", { name: "Continue to your medical intake." }))
    .toBeVisible();
  expect(legacyApiRequests).toBe(0);
});

test("requires exact recurring authorization before billing activation", async ({ page }) => {
  await page.setExtraHTTPHeaders({ [e2eAuthHeaderName]: e2eAuthToken });
  await page.route("**/api/dashboard", authenticatedDashboard);
  let acceptPosts = 0;
  await page.route("**/api/billing/offer", async (route) => {
    if (route.request().method() === "POST") {
      acceptPosts += 1;
      expect(JSON.parse(route.request().postData() ?? "{}")).toEqual({
        offerId: "offer_exact_e2e_001",
        recurringAuthorization: "accepted",
      });
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ status: "billing_active" }),
      });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        authorizationVersion: "billing-offer-v1",
        csrfToken: "csrf_offer_e2e",
        currency: "usd",
        interval: "month",
        offerId: "offer_exact_e2e_001",
        status: "offer_ready",
        unitAmountCents: 19_900,
      }),
    });
  });

  await page.goto("/billing/activate");

  await expect(page.getByText("$199.00 monthly")).toBeVisible();
  expect(acceptPosts).toBe(0);
  await page.getByRole("checkbox", {
    name: /authorize Apoth to charge \$199\.00 today and \$199\.00 every month/i,
  }).check();
  await page.getByRole("button", { name: "Authorize $199.00 and start plan" }).click();
  await expect(page.getByRole("heading", { name: "Your approved plan is active" }))
    .toBeVisible();
  expect(acceptPosts).toBe(1);
});

function authenticatedDashboard(route: Route) {
  return route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ status: "authenticated" }),
  });
}
