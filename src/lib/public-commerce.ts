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
    priceLabel: "$99",
    priceDetail: "per month after clinical approval",
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

export function checkoutHref(product: PublicProductCode) {
  return `/checkout?product=${encodeURIComponent(product)}`;
}
