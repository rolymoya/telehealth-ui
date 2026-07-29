import { describe, expect, it, vi } from "vitest";
import { beginEnrollmentCheckout } from "@/lib/enrollment/checkout-service";
import { createInMemoryEnrollmentRepository } from "@/lib/enrollment/repository";

const fixedIds = {
  attemptSecret: () => "attempt_secret_opaque_001",
  enrollmentId: () => "apoth_order_opaque_001",
  leaseOwner: () => "checkout_worker_opaque_001",
};

const baseInput = {
  catalog: {
    resolve: (publicCode: string) => publicCode === "weight"
      ? {
        cancelPath: "/weight-loss" as const,
        internalCatalogCode: "catalog_opaque_001",
      }
      : null,
  },
  ids: fixedIds,
  integrationIdentifier: "apoth_checkout_abcdefgh",
  marketingOrigin: "https://www.apoth.example",
  now: new Date("2026-07-29T01:00:00.000Z"),
  publicCatalogCode: "weight",
  signingSecret: { signingSecret: "checkout_signing_secret_at_least_32_bytes" },
  stage: "staging" as const,
  successOrigin: "https://account.apoth.example",
};

describe("anonymous enrollment Checkout orchestration", () => {
  it("atomically creates an attempt before opening no-charge hosted Checkout", async () => {
    const repository = createInMemoryEnrollmentRepository();
    const stripeCreate = vi.fn().mockResolvedValue({
      id: "cs_opaque_001",
      url: "https://checkout.stripe.com/c/pay/cs_opaque_001",
    });

    const result = await beginEnrollmentCheckout({
      ...baseInput,
      repository,
      stripe: { checkout: { sessions: { create: stripeCreate } } },
    });

    expect(result).toMatchObject({
      ok: true,
      status: "checkout_session_created",
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_opaque_001",
    });
    expect(result.ok && result.attemptCookie).toContain(".");

    const [params, options] = stripeCreate.mock.calls[0];
    expect(params).toMatchObject({
      client_reference_id: "apoth_order_opaque_001",
      currency: "usd",
      customer_creation: "always",
      metadata: {
        apoth_order_id: "apoth_order_opaque_001",
        apoth_stage: "staging",
      },
      mode: "setup",
      success_url: "https://account.apoth.example/api/enrollment/checkout-return?session_id={CHECKOUT_SESSION_ID}",
    });
    expect("payment_method_types" in params).toBe(false);
    expect("line_items" in params).toBe(false);
    expect("payment_intent_data" in params).toBe(false);
    expect("subscription_data" in params).toBe(false);
    expect(options).toEqual({
      idempotencyKey: "apoth:staging:stripe_checkout:apoth_order_opaque_001",
    });

    expect(await repository.getEnrollment("apoth_order_opaque_001")).toMatchObject({
      ok: true,
      value: {
        checkout: "open",
        stripeCheckoutSessionId: "cs_opaque_001",
        version: 2,
      },
    });
    expect(await repository.getExternalOperation(
      "operation_stripe_checkout_apoth_order_opaque_001",
    )).toMatchObject({
      ok: true,
      value: {
        resultPointer: "cs_opaque_001",
        state: "succeeded",
      },
    });
  });

  it("does not create records or call Stripe for an unknown catalog code", async () => {
    const repository = createInMemoryEnrollmentRepository();
    const stripeCreate = vi.fn();

    expect(await beginEnrollmentCheckout({
      ...baseInput,
      publicCatalogCode: "unknown",
      repository,
      stripe: { checkout: { sessions: { create: stripeCreate } } },
    })).toEqual({ ok: false, code: "catalog_unavailable" });

    expect(stripeCreate).not.toHaveBeenCalled();
    expect(await repository.getEnrollment("apoth_order_opaque_001")).toEqual({
      ok: true,
      value: null,
    });
  });

  it("supports loopback return URLs in staging development only", async () => {
    const stripeCreate = vi.fn().mockResolvedValue({
      id: "cs_opaque_001",
      url: "https://checkout.stripe.com/c/pay/cs_opaque_001",
    });
    const localOrigins = {
      marketingOrigin: "http://127.0.0.1:3000",
      successOrigin: "http://127.0.0.1:5173",
    };

    const staging = await beginEnrollmentCheckout({
      ...baseInput,
      ...localOrigins,
      repository: createInMemoryEnrollmentRepository(),
      stripe: { checkout: { sessions: { create: stripeCreate } } },
    });
    expect(staging.ok).toBe(true);
    expect(stripeCreate).toHaveBeenCalledWith(expect.objectContaining({
      cancel_url: "http://127.0.0.1:3000/weight-loss",
      success_url: "http://127.0.0.1:5173/api/enrollment/checkout-return?session_id={CHECKOUT_SESSION_ID}",
    }), expect.anything());

    expect(await beginEnrollmentCheckout({
      ...baseInput,
      ...localOrigins,
      repository: createInMemoryEnrollmentRepository(),
      stage: "production",
      stripe: { checkout: { sessions: { create: vi.fn() } } },
    })).toEqual({ ok: false, code: "checkout_configuration_invalid" });
  });

  it("retains a retryable operation when Stripe has an ambiguous failure", async () => {
    const repository = createInMemoryEnrollmentRepository();
    const stripeCreate = vi.fn().mockRejectedValue(new Error("timeout"));

    expect(await beginEnrollmentCheckout({
      ...baseInput,
      repository,
      stripe: { checkout: { sessions: { create: stripeCreate } } },
    })).toEqual({ ok: false, code: "checkout_unavailable" });

    expect(await repository.getExternalOperation(
      "operation_stripe_checkout_apoth_order_opaque_001",
    )).toMatchObject({
      ok: true,
      value: {
        attemptCount: 1,
        errorCode: "stripe_request_ambiguous",
        state: "retryable",
      },
    });
  });

  it("refuses a non-Stripe redirect URL even after a nominal Stripe success", async () => {
    const repository = createInMemoryEnrollmentRepository();

    expect(await beginEnrollmentCheckout({
      ...baseInput,
      repository,
      stripe: {
        checkout: {
          sessions: {
            create: vi.fn().mockResolvedValue({
              id: "cs_opaque_001",
              url: "https://evil.example/collect",
            }),
          },
        },
      },
    })).toEqual({ ok: false, code: "checkout_unavailable" });
  });
});
