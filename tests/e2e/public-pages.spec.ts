import { expect, test } from "@playwright/test";
import {
  collectUnexpectedPageErrors,
  expectedPatientHref,
  expectNoHorizontalOverflow,
  expectPublicRouteReady,
} from "./support/public";

const publicRoutes = [
  { path: "/", heading: "Better health has never been easier" },
  { path: "/about", heading: "What Apoth is, what it isn't, and how we're set up." },
  { path: "/privacy", heading: "Privacy Policy" },
  { path: "/terms", heading: "Terms of Service" },
  {
    path: "/get-started",
    heading: "Start with the privacy notice.",
    allowedConsoleErrors: [
      /Failed to load resource: the server responded with a status of 401/,
    ],
  },
  { path: "/sign-in", heading: "Sign in to continue." },
  { path: "/sign-up", heading: "Create your account." },
  { path: "/reset-password", heading: "Reset your password." },
  { path: "/verify-email", heading: "Verify your email." },
];

test.describe("public routes", () => {
  for (const route of publicRoutes) {
    test(`${route.path} loads without page errors`, async ({ page }) => {
      await expectPublicRouteReady(page, route.path, {
        allowedConsoleErrors: route.allowedConsoleErrors,
      });
      await expect(
        page.getByRole("heading", { name: route.heading }),
      ).toBeVisible();
      await expectNoHorizontalOverflow(page);
    });
  }
});

test.describe("public navigation and CTAs", () => {
  test("header navigation covers weight-loss education and staged enrollment entry", async ({ page }) => {
    const errors = collectUnexpectedPageErrors(page);

    await page.goto("/");
    await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", {
      name: "Weight Loss",
    }).click();
    await expect(page).toHaveURL(/\/weight-loss$/);
    await expect(
      page.getByRole("heading", { name: "Personalized GLP-1 Treatments" }),
    ).toBeVisible();

    await page.goto("/");
    await expect(page.getByRole("link", { name: "Get started" }).first())
      .toHaveAttribute("href", expectedPatientHref("/get-started?product=weight"));

    errors.expectNone();
  });

  test("footer help and legal links reach static policy pages", async ({ page }) => {
    const errors = collectUnexpectedPageErrors(page);

    await page.goto("/");
    await page.locator("#footer").getByRole("link", { name: "About Apoth" }).click();
    await expect(page).toHaveURL(/\/about$/);
    await expect(
      page.getByRole("heading", {
        name: "What Apoth is, what it isn't, and how we're set up.",
      }),
    ).toBeVisible();

    await page.goto("/");
    await page.locator("#footer").getByRole("link", { name: "Privacy policy" }).click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();

    await page.goto("/");
    await page.locator("#footer").getByRole("link", { name: "Terms of service" }).click();
    await expect(page).toHaveURL(/\/terms$/);
    await expect(page.getByRole("heading", { name: "Terms of Service" })).toBeVisible();

    errors.expectNone();
  });

  test("start page CTAs route back to public education sections", async ({ page }) => {
    const errors = collectUnexpectedPageErrors(page, {
      allowedConsoleErrors: [
        /Failed to load resource: the server responded with a status of 401/,
      ],
    });

    await page.goto("/get-started");
    await page.getByRole("link", { name: "Explore weight loss" }).click();
    await expect(page).toHaveURL(/\/weight-loss$/);

    await page.goto("/get-started");
    await page.getByRole("link", { name: "How a visit goes" }).click();
    await expect(page).toHaveURL(/\/weight-loss#how-it-works$/);

    errors.expectNone();
  });
});
