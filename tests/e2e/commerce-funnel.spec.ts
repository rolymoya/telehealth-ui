import { expect, test } from "@playwright/test";

test("presents checkout as account creation with no amount due today", async ({ page }) => {
  await page.route("**/api/enrollment/checkout", async (route) => {
    const request = route.request();
    expect(request.method()).toBe("POST");
    expect(request.headers()["x-apoth-checkout-intent"]).toBe("create");
    expect(JSON.parse(request.postData() ?? "{}")).toEqual({ catalogCode: "weight" });
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_enrollment_001",
        status: "checkout_session_created",
      }),
    });
  });
  await page.route("https://checkout.stripe.com/**", (route) => route.fulfill({
    contentType: "text/html",
    body: "<title>Stripe test checkout</title><main>Secure payment method setup</main>",
  }));

  await page.goto("/checkout?product=weight");

  await expect(page.getByRole("heading", { name: /One checkout/i })).toBeVisible();
  await expect(page.getByText("Due today")).toBeVisible();
  await expect(page.getByText("$0", { exact: true })).toBeVisible();
  await expect(page.getByText(/Apple Pay appears automatically/)).toBeVisible();
  await expect(page.getByText(/no separate signup form or password required/i)).toBeVisible();
  await expect(page.getByText(/Final treatment and price depend on independent clinical approval/i)).toBeVisible();

  await page.getByRole("button", { name: "Continue to checkout" }).click();
  await expect(page).toHaveURL("https://checkout.stripe.com/c/pay/cs_test_enrollment_001");
  await expect(page.getByText("Secure payment method setup")).toBeVisible();
});

test("converges from verified setup through email OTP to a patient-scoped portal POST", async ({ page }) => {
  const apiRequests: Array<{ body: string | null; method: string; path: string }> = [];
  await page.route("**/api/enrollment/status", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ status: "verification_ready" }),
  }));
  await page.route("**/api/auth/email-otp/start", async (route) => {
    apiRequests.push(requestSummary(route.request()));
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        status: "verification_code_sent",
        transactionHandle: "otp_handle_opaque_e2e_000001",
      }),
    });
  });
  await page.route("**/api/auth/email-otp/confirm", async (route) => {
    apiRequests.push(requestSummary(route.request()));
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ status: "account_created" }),
    });
  });
  await page.route("**/api/dashboard", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ status: "authenticated" }),
  }));
  await page.route("**/api/portal/launch", async (route) => {
    apiRequests.push(requestSummary(route.request()));
    await route.fulfill({
      status: 303,
      headers: { location: "https://portal.example.test/launch/opaque" },
    });
  });

  await page.goto("/checkout/complete");
  await expect(page.getByRole("heading", { name: /Confirm the email used at checkout/i })).toBeVisible();
  await expect(page.getByText(/No password is needed/)).toBeVisible();

  await page.getByRole("button", { name: "Email me a code" }).click();
  await page.getByLabel("Six-digit code").fill("123456");
  await page.getByRole("button", { name: "Confirm and continue" }).click();

  await expect(page.getByRole("heading", { name: "Continue to your medical intake." })).toBeVisible();
  await expect(page.getByText(/charged only if treatment is approved/i)).toBeVisible();
  await page.getByRole("button", { name: "Continue to medical intake" }).click();

  await expect.poll(() => apiRequests.some((request) => request.path === "/api/portal/launch"))
    .toBe(true);
  expect(apiRequests).toEqual([
    { body: "{}", method: "POST", path: "/api/auth/email-otp/start" },
    {
      body: JSON.stringify({
        code: "123456",
        transactionHandle: "otp_handle_opaque_e2e_000001",
      }),
      method: "POST",
      path: "/api/auth/email-otp/confirm",
    },
    { body: "intent=launch", method: "POST", path: "/api/portal/launch" },
  ]);
});

test("retires native intake routes into checkout or the white-label portal", async ({ page }) => {
  const legacyRequests: string[] = [];
  await page.route("**/api/onboarding/mdi/**", (route) => {
    legacyRequests.push(route.request().url());
    return route.abort();
  });
  await page.route("**/api/dashboard", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ status: "authenticated" }),
  }));

  for (const route of ["/get-started", "/intake", "/sign-up"]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/checkout\?product=weight$/);
  }

  for (const route of ["/onboarding/consent", "/onboarding/mdi", "/medication-management"]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/portal\/launch$/);
    await expect(page.getByRole("heading", { name: "Continue to your medical intake." })).toBeVisible();
  }
  expect(legacyRequests).toEqual([]);
});

function requestSummary(request: import("@playwright/test").Request) {
  return {
    body: request.postData(),
    method: request.method(),
    path: new URL(request.url()).pathname,
  };
}
