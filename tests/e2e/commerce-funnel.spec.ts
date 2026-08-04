import { expect, test } from "@playwright/test";

test("initializes hosted checkout as account creation with no amount due today", async ({ page }) => {
  await page.route("**/api/enrollment/checkout", async (route) => {
    const request = route.request();
    expect(request.method()).toBe("POST");
    expect(request.headers()["x-apoth-checkout-initialization"])
      .toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(JSON.parse(request.postData() ?? "{}")).toEqual({ product: "weight" });
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_enrollment_001",
        status: "checkout_session_created",
        uiMode: "hosted",
      }),
    });
  });
  await page.route("https://checkout.stripe.com/**", (route) => route.fulfill({
    contentType: "text/html",
    body: [
      "<title>Stripe test checkout</title>",
      "<main>",
      "<h1>Secure account checkout</h1>",
      "<p>Due today: $0</p>",
      "<p>Your payment method is saved for later. No charge occurs today.</p>",
      "</main>",
    ].join(""),
  }));

  await page.goto("/checkout?product=weight");

  await expect(page).toHaveURL("https://checkout.stripe.com/c/pay/cs_test_enrollment_001");
  await expect(page.getByRole("heading", { name: "Secure account checkout" })).toBeVisible();
  await expect(page.getByText("Due today: $0")).toBeVisible();
  await expect(page.getByText(/No charge occurs today/)).toBeVisible();
});

test("converges from verified setup through patient-scoped identity binding", async ({ page }) => {
  const apiRequests: Array<{ body: string | null; method: string; path: string }> = [];
  await page.route("**/api/enrollment/status", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      identityBound: false,
      paymentSetupComplete: true,
      status: "payment_setup_complete",
    }),
  }));
  await page.route("**/api/enrollment/bind", async (route) => {
    apiRequests.push(requestSummary(route.request()));
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        redirect: "/intake",
        status: "identity_bound",
      }),
    });
  });
  await page.route("**/api/intake/bootstrap", (route) => route.fulfill({
    contentType: "application/json",
    status: 403,
    body: JSON.stringify({ code: "privacy_notice_required" }),
  }));

  await page.goto("/checkout/complete");

  await expect(page).toHaveURL(/\/intake$/);
  await expect(page.getByRole("heading", {
    name: "Privacy notice, then a short precheck.",
  })).toBeVisible();
  expect(apiRequests).toEqual([
    { body: "{}", method: "POST", path: "/api/enrollment/bind" },
  ]);
});

test("keeps the active native intake and account routes", async ({ page }) => {
  await page.route("**/api/dashboard", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ status: "authenticated" }),
  }));
  await page.route("**/api/intake/bootstrap", (route) => route.fulfill({
    contentType: "application/json",
    status: 403,
    body: JSON.stringify({ code: "privacy_notice_required" }),
  }));
  await page.route("**/api/onboarding/mdi/bootstrap", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      caseId: "mdi_case_commerce_e2e",
      csrfToken: "csrf_mdi_commerce_e2e",
      patientId: "mdi_patient_commerce_e2e",
      questionnaireId: "questionnaire_commerce_e2e",
      questions: [],
      status: "ready",
    }),
  }));

  for (const route of [
    { path: "/get-started", heading: "Start with the privacy notice." },
    { path: "/intake", heading: "Privacy notice, then a short precheck." },
    { path: "/sign-up", heading: "Create your account." },
    { path: "/onboarding/consent", heading: "Review telehealth and platform terms." },
    { path: "/onboarding/mdi", heading: "MDI questionnaire" },
    { path: "/medication-management", heading: "Medication management" },
  ]) {
    await page.goto(route.path);
    await expect(page).toHaveURL(new RegExp(`${route.path}$`));
    await expect(page.getByRole("heading", { name: route.heading })).toBeVisible();
  }
});

function requestSummary(request: import("@playwright/test").Request) {
  return {
    body: request.postData(),
    method: request.method(),
    path: new URL(request.url()).pathname,
  };
}
