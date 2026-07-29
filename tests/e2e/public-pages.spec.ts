import { expect, test } from "@playwright/test";
import {
  collectUnexpectedPageErrors,
  expectNoHorizontalOverflow,
  expectPublicRouteReady,
} from "./support/public";

const publicRoutes = [
  { path: "/", heading: "Better health has never been easier" },
  { path: "/about", heading: "What Apoth is, what it isn't, and how we're set up." },
  { path: "/privacy", heading: "Privacy Policy" },
  { path: "/terms", heading: "Terms of Service" },
  { path: "/weight-loss", heading: "Personalized GLP-1 Treatments" },
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
  test("header navigation covers homepage sections and points to account checkout", async ({ page }) => {
    const errors = collectUnexpectedPageErrors(page);

    await page.goto("/");
    await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", {
      name: "FAQs",
    }).click();
    await expect(page).toHaveURL(/#faq$/);
    await expect(
      page.getByRole("heading", { name: "Questions, answered" }),
    ).toBeVisible();

    const checkoutLink = page.getByRole("link", { name: "Start a visit" }).first();
    await expect(checkoutLink).toHaveAttribute("href", /\/checkout\?product=weight$/);
    if (process.env.PLAYWRIGHT_PATIENT_BASE_URL) {
      await expect(checkoutLink).toHaveAttribute(
        "href",
        new URL("/checkout?product=weight", process.env.PLAYWRIGHT_PATIENT_BASE_URL).toString(),
      );
    }

    errors.expectNone();
  });

  test("footer company and legal links reach static policy pages", async ({ page }) => {
    const errors = collectUnexpectedPageErrors(page);
    const footer = page.locator("footer");

    await page.goto("/");
    await footer.getByRole("link", { name: "About Apoth" }).click();
    await expect(page).toHaveURL(/\/about$/);
    await expect(
      page.getByRole("heading", {
        name: "What Apoth is, what it isn't, and how we're set up.",
      }),
    ).toBeVisible();

    await page.goto("/");
    await footer.getByRole("link", { name: "Privacy policy" }).click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();

    await page.goto("/");
    await footer.getByRole("link", { name: "Terms of service" }).click();
    await expect(page).toHaveURL(/\/terms$/);
    await expect(page.getByRole("heading", { name: "Terms of Service" })).toBeVisible();

    errors.expectNone();
  });

});
