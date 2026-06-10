import { expect, test } from "@playwright/test";

test.describe("@smoke public launch path", () => {
  test("home page routes a patient into the start page", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle(/Apoth/);
    await expect(page.getByRole("main")).toBeVisible();

    await page.getByRole("link", { name: "Start a visit" }).first().click();

    await expect(page).toHaveURL(/\/get-started$/);
    await expect(
      page.getByRole("heading", { name: "Connect with a licensed clinician." }),
    ).toBeVisible();
    await expect(
      page.getByText("we will not charge a card before confirming"),
    ).toBeVisible();
  });
});
