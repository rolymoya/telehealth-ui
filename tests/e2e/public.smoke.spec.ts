import { expect, test } from "@playwright/test";
import { expectedPatientHref } from "./support/public";

test.describe("@smoke public launch path", () => {
  test("home page sends the primary CTA to staged enrollment", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle(/Apoth/);
    await expect(page.getByRole("main")).toBeVisible();

    await expect(page.getByRole("link", { name: "Get started" }).first())
      .toHaveAttribute("href", expectedPatientHref("/get-started?product=weight"));
  });
});
