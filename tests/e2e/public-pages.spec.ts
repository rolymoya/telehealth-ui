import { expect, test } from "@playwright/test";
import {
  collectUnexpectedPageErrors,
  expectNoHorizontalOverflow,
  expectPublicRouteReady,
} from "./support/public";

const publicRoutes = [
  { path: "/", heading: "A clearer way to get care, online." },
  { path: "/about", heading: "What Apoth is, what it isn't, and how we're set up." },
  { path: "/privacy", heading: "Privacy Policy" },
  { path: "/terms", heading: "Terms of Service" },
  { path: "/get-started", heading: "Start with a secure account." },
  { path: "/sign-in", heading: "Sign in to continue." },
  { path: "/sign-up", heading: "Create your account." },
  { path: "/reset-password", heading: "Reset your password." },
  { path: "/verify-email", heading: "Verify your email." },
];

test.describe("public routes", () => {
  for (const route of publicRoutes) {
    test(`${route.path} loads without page errors`, async ({ page }) => {
      await expectPublicRouteReady(page, route.path);
      await expect(
        page.getByRole("heading", { name: route.heading }),
      ).toBeVisible();
      await expectNoHorizontalOverflow(page);
    });
  }
});

test.describe("public navigation and CTAs", () => {
  test("header navigation covers homepage sections and start flow", async ({ page }) => {
    const errors = collectUnexpectedPageErrors(page);

    await page.goto("/");
    await page.getByRole("navigation", { name: "Primary" }).getByRole("link", {
      name: "What we treat",
    }).click();
    await expect(page).toHaveURL(/#what-we-treat$/);
    await expect(
      page.getByRole("heading", { name: /Four categories/ }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Start a visit" }).first().click();
    await expect(page).toHaveURL(/\/get-started$/);
    await expect(
      page.getByRole("heading", { name: "Start with a secure account." }),
    ).toBeVisible();

    errors.expectNone();
  });

  test("footer help and legal links reach static policy pages", async ({ page }) => {
    const errors = collectUnexpectedPageErrors(page);

    await page.goto("/");
    await page.getByRole("navigation", { name: "Help" }).getByRole("link", {
      name: "About",
    }).click();
    await expect(page).toHaveURL(/\/about$/);
    await expect(
      page.getByRole("heading", {
        name: "What Apoth is, what it isn't, and how we're set up.",
      }),
    ).toBeVisible();

    await page.goto("/");
    await page.getByRole("navigation", { name: "Legal" }).getByRole("link", {
      name: "Privacy policy",
    }).click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();

    await page.goto("/");
    await page.getByRole("navigation", { name: "Legal" }).getByRole("link", {
      name: "Terms of service",
    }).click();
    await expect(page).toHaveURL(/\/terms$/);
    await expect(page.getByRole("heading", { name: "Terms of Service" })).toBeVisible();

    errors.expectNone();
  });

  test("start page CTAs route back to public education sections", async ({ page }) => {
    const errors = collectUnexpectedPageErrors(page);

    await page.goto("/get-started");
    await page.getByRole("link", { name: "See what we treat" }).click();
    await expect(page).toHaveURL(/\/#what-we-treat$/);

    await page.goto("/get-started");
    await page.getByRole("link", { name: "How a visit goes" }).click();
    await expect(page).toHaveURL(/\/#how-it-works$/);

    errors.expectNone();
  });
});
