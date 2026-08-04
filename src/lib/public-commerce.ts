export const publicProductCodes = ["weight"] as const;

export type PublicProductCode = typeof publicProductCodes[number];

export type PublicProduct = {
  code: PublicProductCode;
  displayName: string;
  planName: string;
  priceLabel: string;
  priceDetail: string;
  dueTodayLabel: "$0";
};

const products: Record<PublicProductCode, PublicProduct> = {
  weight: {
    code: "weight",
    displayName: "Weight management",
    planName: "Apoth weight management membership",
    priceLabel: "$99–$199",
    priceDetail: "per month, based on the treatment prescribed and accepted",
    dueTodayLabel: "$0",
  },
};

export function isPublicProductCode(value: unknown): value is PublicProductCode {
  return typeof value === "string" &&
    (publicProductCodes as readonly string[]).includes(value);
}

export function publicProduct(value: unknown) {
  return isPublicProductCode(value) ? products[value] : null;
}

export function accountHref(path: `/${string}`) {
  const origin = accountOrigin();
  return origin ? new URL(path, `${origin}/`).toString() : path;
}

export function checkoutHref(product: PublicProductCode) {
  return accountHref(`/checkout?product=${encodeURIComponent(product)}`);
}

export function onboardingHref(product: PublicProductCode) {
  return accountHref(`/get-started?product=${encodeURIComponent(product)}`);
}

function accountOrigin() {
  const configured = process.env.NEXT_PUBLIC_ACCOUNT_ORIGIN?.trim();
  if (!configured) {
    return process.env.NODE_ENV === "development"
      ? "http://127.0.0.1:5173"
      : null;
  }
  try {
    const url = new URL(configured);
    const isLocalDevelopment = process.env.NODE_ENV === "development" &&
      url.protocol === "http:" &&
      (url.hostname === "127.0.0.1" || url.hostname === "localhost");
    return (url.protocol === "https:" || isLocalDevelopment) &&
        url.username === "" &&
        url.password === ""
      ? url.origin
      : null;
  } catch {
    return null;
  }
}
