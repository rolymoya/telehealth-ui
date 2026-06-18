import { expect, test } from "@playwright/test";
import { collectUnexpectedPageErrors } from "./support/public";

test.describe("public compliance assertions", () => {
  test("about page keeps entity separation explicit", async ({ page }) => {
    const errors = collectUnexpectedPageErrors(page);

    await page.goto("/about");

    await expect(
      page.getByText("Apoth is a telehealth platform.").first(),
    ).toBeVisible();
    await expect(
      page.getByText("We do not practice medicine. We do not dispense medication."),
    ).toBeVisible();
    await expect(
      page.getByText("MD Integrations").first(),
    ).toBeVisible();
    await expect(
      page.getByText("Every clinical decision").first(),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Medication is dispensed by a licensed pharmacy partner that is a separate legal entity",
      ).first(),
    ).toBeVisible();

    errors.expectNone();
  });

  test("privacy and terms retain legal review banners", async ({ page }) => {
    for (const path of ["/privacy", "/terms"]) {
      const errors = collectUnexpectedPageErrors(page);

      await page.goto(path);
      await expect(page.getByText("Draft for legal review")).toBeVisible();
      await expect(
        page.getByText("intended for review by a healthcare attorney"),
      ).toBeVisible();

      errors.expectNone();
    }
  });

  test("terms page states platform, physician group, and no-treatment boundary", async ({ page }) => {
    const errors = collectUnexpectedPageErrors(page);

    await page.goto("/terms");

    await expect(
      page.getByText("Apoth is a technology and patient-management platform."),
    ).toBeVisible();
    await expect(
      page.getByText("Apoth is not a medical provider, does not practice medicine"),
    ).toBeVisible();
    await expect(
      page.getByText("Clinical care is provided by MD Integrations"),
    ).toBeVisible();
    await expect(
      page.getByText("No treatment relationship is established until a clinician"),
    ).toBeVisible();

    errors.expectNone();
  });

  test("public medication disclosures identify non-FDA-approved compounded products", async ({ page }) => {
    const errors = collectUnexpectedPageErrors(page);

    await page.goto("/");

    await expect(page.getByText("Not FDA-approved").first()).toBeVisible();
    await expect(
      page.getByText("Compounded semaglutide and compounded tirzepatide are not FDA-approved."),
    ).toBeVisible();
    await expect(
      page.getByText("They are not the same as Ozempic, Wegovy, Mounjaro, or Zepbound"),
    ).toBeVisible();
    await expect(
      page.getByText("BPC-157 and retatrutide are investigational and not FDA-approved."),
    ).toBeVisible();

    errors.expectNone();
  });
});
