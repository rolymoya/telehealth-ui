import { expect, test } from "@playwright/test";
import {
  collectUnexpectedPageErrors,
  expectNoHorizontalOverflow,
} from "./support/public";

const viewportCases = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1280, height: 900 },
];

for (const viewport of viewportCases) {
  test.describe(`public responsive smoke: ${viewport.name}`, () => {
    test.use({ viewport });

    test("homepage first viewport keeps heading and start CTA visible", async ({ page }) => {
      const errors = collectUnexpectedPageErrors(page);

      await page.goto("/");

      await expect(
        page.getByRole("heading", { name: "Better health has never been easier" }),
      ).toBeInViewport();

      if (viewport.name === "mobile") {
        await page.getByRole("button", { name: "Open menu" }).click();
        await expect(page.getByRole("navigation", { name: "Mobile navigation" })
          .getByRole("link", { name: "Get started" })).toBeInViewport();
      } else {
        await expect(page.getByRole("link", { name: "Get started" }).first()).toBeInViewport();
      }
      await expectNoHorizontalOverflow(page);
      errors.expectNone();
    });

    test("legal pages keep first viewport readable", async ({ page }) => {
      for (const route of [
        { path: "/privacy", heading: "Privacy Policy" },
        { path: "/terms", heading: "Terms of Service" },
      ]) {
        const errors = collectUnexpectedPageErrors(page);

        await page.goto(route.path);
        await expect(page.getByText("Draft for legal review")).toBeVisible();
        await expect(page.getByRole("heading", { name: route.heading })).toBeInViewport();
        await expectNoHorizontalOverflow(page);
        errors.expectNone();
      }
    });
  });
}

test("keyboard focus exposes skip link and reaches the start CTA", async ({ page }) => {
  const errors = collectUnexpectedPageErrors(page);

  await page.goto("/");
  const skipLink = page.getByRole("link", { name: "Skip to main content" });

  await skipLink.focus();
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();
  await skipLink.press("Enter");
  await expect(page).toHaveURL(/#main-content$/);

  const primaryNavigation = page.getByRole("navigation", { name: "Primary navigation" });
  const faqLink = primaryNavigation.getByRole("link", { name: "FAQs" });
  await faqLink.focus();
  await faqLink.press("Tab");

  await expect(page.getByRole("link", { name: "Get started" }).first()).toBeFocused();
  errors.expectNone();
});
