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
      if (viewport.name === "desktop") {
        await expect(page.getByRole("link", { name: "Get started" }).first())
          .toBeInViewport();
      } else {
        await expect(page.getByRole("button", { name: "Open menu" })).toBeInViewport();
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

test("keyboard focus exposes skip link and reaches the direct checkout CTA", async ({ page }) => {
  const errors = collectUnexpectedPageErrors(page);

  await page.goto("/");
  await page.keyboard.press("Tab");

  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();

  for (let i = 0; i < 6; i += 1) {
    await page.keyboard.press("Tab");
    const focusedName = await page.evaluate(() => document.activeElement?.textContent);
    if (focusedName?.includes("Get started")) {
      break;
    }
  }

  await expect(page.getByRole("link", { name: "Get started" }).first()).toBeFocused();
  errors.expectNone();
});
