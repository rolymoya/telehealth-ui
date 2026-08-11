import { expect, test } from "@playwright/test";

test("retires card-first checkout and sends direct links to the precheck", async ({ page }) => {
  let checkoutRequests = 0;
  await page.route("**/api/enrollment/checkout", (route) => {
    checkoutRequests += 1;
    return route.abort();
  });
  await page.route("**/api/onboarding/start?product=weight", (route) => route.fulfill({
    contentType: "application/json",
    status: 401,
    body: JSON.stringify({ error: "authentication_required" }),
  }));

  await page.goto("/checkout?product=weight");

  await expect(page).toHaveURL(/\/get-started\?product=weight$/);
  await expect(page.getByRole("heading", { name: "Start with the privacy notice." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Start precheck" }))
    .toHaveAttribute("href", "/intake?product=weight");
  expect(checkoutRequests).toBe(0);
});

test("preserves the selected program through anonymous precheck and account creation", async ({ page }) => {
  await page.route("**/api/intake/bootstrap", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ csrfToken: "csrf_anon_e2e", status: "ready_for_anonymous_precheck" }),
  }));
  await page.route("**/api/intake/precheck", async (route) => {
    expect(JSON.parse(route.request().postData() ?? "{}")).toMatchObject({ offering: "weight" });
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ status: "ready_for_account_creation" }),
    });
  });

  await page.goto("/intake?product=weight");

  await expect(page.getByText("Weight management")).toBeVisible();
  await expect(page.getByLabel("Care category")).toHaveCount(0);
  await page.getByLabel("State of residence").selectOption("IL");
  await page.getByRole("spinbutton", { name: "Age" }).fill("34");
  await page.locator('input[name="emergencySymptoms"][value="no"]').check();
  await page.locator('input[name="blockingContraindication"][value="no"]').check();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "Verify your email to continue." })).toBeVisible();
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByRole("button", { name: "Email me a code" })).toBeVisible();
  await expect(page.getByRole("link", { name: /password for an existing account/i }))
    .toHaveAttribute("href", "/sign-in?returnTo=%2Fget-started%3Fproduct%3Dweight");
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await expect(page.locator('input[autocomplete*="cc-"]')).toHaveCount(0);
});

test("keeps the active native account and portal routes", async ({ page }) => {
  await page.route("**/api/dashboard", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ status: "authenticated" }),
  }));
  await page.route("**/api/intake/bootstrap", (route) => route.fulfill({
    contentType: "application/json",
    status: 403,
    body: JSON.stringify({ code: "privacy_notice_required" }),
  }));

  for (const route of [
    { path: "/get-started", heading: "Start with the privacy notice." },
    { path: "/intake", heading: "Privacy notice, then a short precheck." },
    { path: "/sign-up", heading: "Create your account." },
    { path: "/onboarding/consent", heading: "Review telehealth and platform terms." },
    { path: "/portal/launch", heading: "Continue to your medical intake" },
    { path: "/medication-management", heading: "Medication management" },
  ]) {
    await page.goto(route.path);
    await expect(page).toHaveURL(new RegExp(`${route.path}$`));
    await expect(page.getByRole("heading", { name: route.heading })).toBeVisible();
  }
});
