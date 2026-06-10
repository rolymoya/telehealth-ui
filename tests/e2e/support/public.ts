import { expect, type Page } from "@playwright/test";

export function collectUnexpectedPageErrors(page: Page) {
  const errors: string[] = [];

  function pushIfUnexpected(text: string) {
    if (
      text.includes("WebSocket connection to") &&
      text.includes("/_next/webpack-hmr") &&
      text.includes("failed")
    ) {
      return;
    }

    errors.push(text);
  }

  page.on("pageerror", (error) => {
    pushIfUnexpected(error.message);
  });

  page.on("console", (message) => {
    if (message.type() === "error") {
      pushIfUnexpected(message.text());
    }
  });

  return {
    expectNone() {
      expect(errors).toEqual([]);
    },
  };
}

export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const documentElement = document.documentElement;
    return documentElement.scrollWidth - documentElement.clientWidth;
  });

  expect(overflow).toBeLessThanOrEqual(1);
}

export async function expectPublicRouteReady(page: Page, path: string) {
  const errors = collectUnexpectedPageErrors(page);

  await page.goto(path);
  await expect(page.getByRole("main")).toBeVisible();
  errors.expectNone();
}
