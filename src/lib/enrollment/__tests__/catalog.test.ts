import { describe, expect, it } from "vitest";
import { resolveEnrollmentCheckoutRuntimeConfig } from "@/lib/enrollment/catalog";

describe("enrollment Checkout runtime catalog", () => {
  it("keeps the public product code separate from the opaque persisted catalog pointer", () => {
    const config = resolveEnrollmentCheckoutRuntimeConfig({
      APOTH_ACCOUNT_ORIGIN: "https://account.apoth.health/path-ignored",
      APOTH_CHECKOUT_CATALOG_WEIGHT_ID: "catalog_opaque_001",
      APOTH_CHECKOUT_SIGNUP_ENABLED: "true",
      APOTH_MARKETING_ORIGIN: "https://apoth.health",
      APOTH_STAGE: "staging",
      APOTH_STRIPE_INTEGRATION_IDENTIFIER: "apoth_checkout_abcdefgh",
    });

    expect(config).toMatchObject({
      ok: true,
      value: {
        enabled: true,
        marketingOrigin: "https://apoth.health",
        stage: "staging",
        successOrigin: "https://account.apoth.health",
      },
    });
    expect(config.ok && config.value.catalog.resolve("weight")).toEqual({
      cancelPath: "/weight-loss",
      internalCatalogCode: "catalog_opaque_001",
    });
    expect(config.ok && config.value.catalog.resolve("unknown")).toBeNull();
  });

  it("fails closed unless the feature flag and secure configuration are complete", () => {
    expect(resolveEnrollmentCheckoutRuntimeConfig({})).toEqual({ ok: false });
    expect(resolveEnrollmentCheckoutRuntimeConfig({
      APOTH_CHECKOUT_CATALOG_WEIGHT_ID: "catalog_weight_loss",
      APOTH_CHECKOUT_SIGNUP_ENABLED: "true",
      APOTH_MARKETING_ORIGIN: "http://apoth.health",
      APOTH_ACCOUNT_ORIGIN: "https://account.apoth.health",
      APOTH_STRIPE_INTEGRATION_IDENTIFIER: "apoth_checkout_abcdefgh",
    })).toEqual({ ok: false });
  });

  it("allows loopback HTTP only for staging checkout development", () => {
    const staging = resolveEnrollmentCheckoutRuntimeConfig({
      APOTH_ACCOUNT_ORIGIN: "http://127.0.0.1:5173",
      APOTH_CHECKOUT_CATALOG_WEIGHT_ID: "catalog_weight_loss",
      APOTH_CHECKOUT_SIGNUP_ENABLED: "true",
      APOTH_MARKETING_ORIGIN: "http://127.0.0.1:3000",
      APOTH_STAGE: "staging",
      APOTH_STRIPE_INTEGRATION_IDENTIFIER: "apoth_checkout_abcdefgh",
    });
    expect(staging).toMatchObject({
      ok: true,
      value: {
        marketingOrigin: "http://127.0.0.1:3000",
        successOrigin: "http://127.0.0.1:5173",
      },
    });

    expect(resolveEnrollmentCheckoutRuntimeConfig({
      APOTH_ACCOUNT_ORIGIN: "http://127.0.0.1:5173",
      APOTH_CHECKOUT_CATALOG_WEIGHT_ID: "catalog_weight_loss",
      APOTH_CHECKOUT_SIGNUP_ENABLED: "true",
      APOTH_MARKETING_ORIGIN: "http://127.0.0.1:3000",
      APOTH_STAGE: "production",
      APOTH_STRIPE_INTEGRATION_IDENTIFIER: "apoth_checkout_abcdefgh",
    })).toEqual({ ok: false });
  });
});
