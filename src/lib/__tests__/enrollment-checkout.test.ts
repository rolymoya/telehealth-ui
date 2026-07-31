import { describe, expect, it, vi } from "vitest";
import {
  createInMemoryAppDataRepository,
  patientProfileKey,
  pendingEnrollmentKey,
  stripeLinkageKey,
} from "@/lib/dynamodb/app-data";
import {
  bindVerifiedEnrollmentIdentity,
  checkoutConsentVersion,
  createInMemoryEnrollmentRepository,
  initializeEnrollmentCheckout,
  markEnrollmentPaymentSetupComplete,
  recordEnrollmentConsent,
  type EnrollmentStripeClient,
} from "@/lib/enrollment/checkout-service";

const enrollmentId = "apoth_order_0123456789abcdef0123456789abcdef";
const now = "2026-07-29T18:00:00.000Z";
const session = {
  client_secret: "cs_test_enrollment_secret_checkoutsecret",
  expires_at: Math.floor(Date.parse("2026-07-30T12:00:00.000Z") / 1000),
  id: "cs_test_enrollment",
  status: "open",
  url: null,
};

describe("pending enrollment checkout", () => {
  it("creates once, resumes safely, and never persists the Checkout client secret", async () => {
    const appData = createInMemoryAppDataRepository();
    const repository = createInMemoryEnrollmentRepository(appData);
    const create = vi.fn(async () => session);
    const retrieve = vi.fn(async () => session);
    const stripe = {
      checkout: { sessions: { create, retrieve } },
    } as EnrollmentStripeClient;

    const first = await initializeEnrollmentCheckout(checkoutInput(repository, stripe));
    const resumed = await initializeEnrollmentCheckout(checkoutInput(repository, stripe));

    expect(first).toEqual({
      clientSecret: session.client_secret,
      ok: true,
      status: "checkout_session_created",
      uiMode: "custom",
    });
    expect(resumed).toEqual(first);
    expect(create).toHaveBeenCalledTimes(1);
    expect(retrieve).toHaveBeenCalledWith(session.id);
    expect(create).toHaveBeenCalledWith(
      expect.any(Object),
      {
        idempotencyKey: `apoth:staging:enrollment-checkout:${enrollmentId}:0`,
      },
    );
    const stored = appData.get(pendingEnrollmentKey(enrollmentId));
    expect(stored.ok && stored.value).toMatchObject({
      checkoutSessionId: session.id,
      checkoutUiMode: "custom",
      enrollmentId,
      productCode: "weight",
      status: "checkout_session_pending",
    });
    expect(JSON.stringify(stored)).not.toContain(session.client_secret);
  });

  it("logs only bounded Stripe diagnostics when Session creation fails", async () => {
    const appData = createInMemoryAppDataRepository();
    const repository = createInMemoryEnrollmentRepository(appData);
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const stripe = {
      checkout: {
        sessions: {
          create: vi.fn(async () => {
            throw {
              code: "parameter_invalid_enum",
              message: "must never reach logs: patient@example.com",
              raw: { request: "sk_test_must_never_reach_logs" },
              statusCode: 400,
              type: "StripeInvalidRequestError",
            };
          }),
          retrieve: vi.fn(async () => session),
        },
      },
    } as EnrollmentStripeClient;

    const result = await initializeEnrollmentCheckout(checkoutInput(repository, stripe));

    expect(result).toEqual({ ok: false, code: "stripe_unavailable" });
    expect(diagnostic).toHaveBeenCalledWith(JSON.stringify({
      event: "enrollment_checkout_stripe_failure",
      operation: "create",
      stripeCode: "parameter_invalid_enum",
      stripeType: "StripeInvalidRequestError",
      statusCode: 400,
    }));
    const logged = JSON.stringify(diagnostic.mock.calls);
    expect(logged).not.toContain("patient@example.com");
    expect(logged).not.toContain("sk_test_");
    expect(appData.get(pendingEnrollmentKey(enrollmentId))).toMatchObject({
      ok: true,
      value: { checkoutAttempt: 1 },
    });
    diagnostic.mockRestore();
  });

  it("uses a fresh idempotency key after a Stripe idempotency rejection", async () => {
    const appData = createInMemoryAppDataRepository();
    const repository = createInMemoryEnrollmentRepository(appData);
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const create = vi.fn()
      .mockRejectedValueOnce({ type: "StripeIdempotencyError", statusCode: 400 })
      .mockResolvedValueOnce(session);
    const stripe = {
      checkout: {
        sessions: {
          create,
          retrieve: vi.fn(async () => session),
        },
      },
    } as EnrollmentStripeClient;

    expect(await initializeEnrollmentCheckout(checkoutInput(repository, stripe)))
      .toEqual({ ok: false, code: "stripe_unavailable" });
    expect(await initializeEnrollmentCheckout(checkoutInput(repository, stripe)))
      .toMatchObject({ ok: true, uiMode: "custom" });
    expect(create.mock.calls.map((call) => call[1]?.idempotencyKey)).toEqual([
      `apoth:staging:enrollment-checkout:${enrollmentId}:0`,
      `apoth:staging:enrollment-checkout:${enrollmentId}:1`,
    ]);
    expect(appData.get(pendingEnrollmentKey(enrollmentId))).toMatchObject({
      ok: true,
      value: { checkoutAttempt: 1, checkoutSessionId: session.id },
    });
    diagnostic.mockRestore();
  });

  it("logs response shape without logging an unsafe Stripe response value", async () => {
    const appData = createInMemoryAppDataRepository();
    const repository = createInMemoryEnrollmentRepository(appData);
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const stripe = {
      checkout: {
        sessions: {
          create: vi.fn(async () => ({
            client_secret: "unsafe-secret-value",
            id: "unsafe-session-id",
            status: "open",
            ui_mode: "elements",
            url: null,
          })),
          retrieve: vi.fn(async () => session),
        },
      },
    } as EnrollmentStripeClient;

    expect(await initializeEnrollmentCheckout(checkoutInput(repository, stripe)))
      .toEqual({ ok: false, code: "stripe_unavailable" });
    expect(diagnostic).toHaveBeenCalledWith(JSON.stringify({
      event: "enrollment_checkout_stripe_response_invalid",
      operation: "create",
      expectedUiMode: "custom",
      hasClientSecret: true,
      hasId: true,
      hasUrl: false,
      clientSecretHasSecretMarker: false,
      clientSecretStartsWithSessionId: false,
      clientSecretUsesExpectedAlphabet: false,
      clientSecretUsesUrlSafeAlphabet: true,
      idUsesExpectedAlphabet: false,
      returnedStatus: "open",
      returnedUiMode: "elements",
    }));
    const logged = JSON.stringify(diagnostic.mock.calls);
    expect(logged).not.toContain("unsafe-secret-value");
    expect(logged).not.toContain("unsafe-session-id");
    diagnostic.mockRestore();
  });

  it("requires server-recorded consent before accepting webhook completion", async () => {
    const appData = createInMemoryAppDataRepository();
    const repository = createInMemoryEnrollmentRepository(appData);
    const stripe = stripeClient();
    await initializeEnrollmentCheckout(checkoutInput(repository, stripe));

    const premature = await markEnrollmentPaymentSetupComplete({
      checkoutSessionId: session.id,
      enrollmentId,
      now: "2026-07-29T18:01:00.000Z",
      repository,
      stripeCustomerId: "cus_opaque_001",
      stripeSetupIntentId: "seti_opaque_001",
    });
    expect(premature).toMatchObject({
      error: { kind: "validation_failed" },
      ok: false,
    });

    expect(await recordEnrollmentConsent({
      consentVersion: checkoutConsentVersion,
      enrollmentId,
      now: "2026-07-29T18:02:00.000Z",
      repository,
    })).toMatchObject({ ok: true, consentVersion: checkoutConsentVersion });

    const completed = await markEnrollmentPaymentSetupComplete({
      checkoutSessionId: session.id,
      enrollmentId,
      now: "2026-07-29T18:03:00.000Z",
      repository,
      stripeCustomerId: "cus_opaque_001",
      stripeSetupIntentId: "seti_opaque_001",
    });
    expect(completed).toMatchObject({
      ok: true,
      value: {
        paymentSetupCompletedAt: "2026-07-29T18:03:00.000Z",
        status: "payment_setup_complete",
      },
    });
  });

  it("binds only a webhook-complete enrollment to the verified Cognito identity", async () => {
    const appData = createInMemoryAppDataRepository();
    const repository = createInMemoryEnrollmentRepository(appData);
    await initializeEnrollmentCheckout(checkoutInput(repository, stripeClient()));
    await recordEnrollmentConsent({
      consentVersion: checkoutConsentVersion,
      enrollmentId,
      now: "2026-07-29T18:01:00.000Z",
      repository,
    });
    await markEnrollmentPaymentSetupComplete({
      checkoutSessionId: session.id,
      enrollmentId,
      now: "2026-07-29T18:02:00.000Z",
      repository,
      stripeCustomerId: "cus_opaque_001",
      stripeSetupIntentId: "seti_opaque_001",
    });

    const bound = await bindVerifiedEnrollmentIdentity({
      cognitoSub: "cognito-sub-0123456789abcdef",
      enrollmentId,
      now: "2026-07-29T18:03:00.000Z",
      repository,
    });

    expect(bound).toEqual({
      ok: true,
      redirect: "/intake",
      status: "identity_bound",
    });
    expect(appData.get(patientProfileKey("cognito-sub-0123456789abcdef")))
      .toMatchObject({
        ok: true,
        value: { onboardingStatus: "profile_pending" },
      });
    expect(appData.get(stripeLinkageKey("cognito-sub-0123456789abcdef")))
      .toMatchObject({
        ok: true,
        value: {
          billingStatus: "payment_method_collected",
          stripeCustomerId: "cus_opaque_001",
        },
      });
    expect(appData.get(pendingEnrollmentKey(enrollmentId))).toMatchObject({
      ok: true,
      value: {
        cognitoSub: "cognito-sub-0123456789abcdef",
        status: "identity_bound",
      },
    });
  });
});

function checkoutInput(
  repository: ReturnType<typeof createInMemoryEnrollmentRepository>,
  stripe: EnrollmentStripeClient,
) {
  return {
    enrollmentId,
    integrationIdentifier: "apoth_enrollment_qjxmzvra",
    now,
    productCode: "weight" as const,
    repository,
    stage: "staging" as const,
    stripe,
    uiMode: "custom" as const,
    urls: {
      cancelUrl: "https://staging.apoth.example/checkout?product=weight",
      returnUrl: "https://staging.apoth.example/checkout/complete",
      successUrl: "https://staging.apoth.example/checkout/complete",
    },
  };
}

function stripeClient() {
  return {
    checkout: {
      sessions: {
        create: vi.fn(async () => session),
        retrieve: vi.fn(async () => session),
      },
    },
  } as EnrollmentStripeClient;
}
