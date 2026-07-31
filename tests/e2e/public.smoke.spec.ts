import { expect, test } from "@playwright/test";

test.describe("@smoke public launch path", () => {
  test("home page sends the primary CTA directly to checkout", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle(/Apoth/);
    await expect(page.getByRole("main")).toBeVisible();

    await expect(page.getByRole("link", { name: "Get started" }).first())
      .toHaveAttribute("href", "/checkout?product=weight");
  });
});
