import { expect, test } from "@playwright/test";

test.describe("@smoke public launch path", () => {
  test("home page routes a patient toward account checkout", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle(/Apoth/);
    await expect(page.getByRole("main")).toBeVisible();

    const checkoutLink = page.getByRole("link", { name: "Start a visit" }).first();
    await expect(checkoutLink).toHaveAttribute("href", /\/checkout\?product=weight$/);
    if (process.env.PLAYWRIGHT_PATIENT_BASE_URL) {
      await expect(checkoutLink).toHaveAttribute(
        "href",
        new URL("/checkout?product=weight", process.env.PLAYWRIGHT_PATIENT_BASE_URL).toString(),
      );
    }
  });
});
