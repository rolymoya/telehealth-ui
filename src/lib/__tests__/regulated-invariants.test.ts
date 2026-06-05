import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { screenLightweightEligibility } from "@/lib/eligibility";
import { submitQuestionnaireAndDiscardAnswers } from "@/lib/mdi-questionnaire";
import { canActivateBilling } from "@/lib/payment-gating";
import { checkStateAvailability } from "@/lib/state-availability";
import { validateStripeMetadata } from "@/lib/stripe-policy";
import {
  decideWebhookIdempotency,
  verifyWebhookSignature,
} from "@/lib/webhooks";
import {
  mdiCaseCreatedEventFixture,
  mdiClinicalApprovalEventFixture,
  mdiQuestionnaireFixture,
} from "@/test/fixtures/mdi";
import {
  stripeOpaqueMetadataFixture,
  stripeWebhookEventFixture,
} from "@/test/fixtures/stripe";

describe("regulated launch invariants", () => {
  it("gates state availability before intake continues", () => {
    expect(
      checkStateAvailability({
        state: " il ",
        careCategory: "weight",
        supportedStates: ["IL", "WI"],
      }),
    ).toEqual({ available: true, normalizedState: "IL" });

    expect(
      checkStateAvailability({
        state: "CA",
        careCategory: "weight",
        supportedStates: ["IL", "WI"],
      }),
    ).toEqual({
      available: false,
      normalizedState: "CA",
      reason: "unsupported_state",
    });
  });

  it("keeps lightweight eligibility separate from clinical approval", () => {
    expect(
      screenLightweightEligibility({
        age: 34,
        stateAvailable: true,
        hasEmergencySymptoms: false,
        hasBlockingContraindication: false,
      }),
    ).toEqual({ outcome: "eligible_for_intake" });

    expect(
      screenLightweightEligibility({
        age: 17,
        stateAvailable: true,
        hasEmergencySymptoms: false,
        hasBlockingContraindication: false,
      }),
    ).toEqual({ outcome: "ineligible", reason: "under_18" });
  });

  it("submits MDI questionnaire answers and discards local answer retention", async () => {
    const submit = vi.fn().mockResolvedValue({ mdiSubmissionId: "mdi_submission_001" });

    const result = await submitQuestionnaireAndDiscardAnswers(
      mdiQuestionnaireFixture,
      submit,
    );

    expect(submit).toHaveBeenCalledWith(mdiQuestionnaireFixture);
    expect(result).toEqual({
      mdiSubmissionId: "mdi_submission_001",
      retainedAnswers: null,
    });
    expect(JSON.stringify(result)).not.toContain("No current medications");
  });

  it("allows only opaque Stripe metadata", () => {
    expect(validateStripeMetadata(stripeOpaqueMetadataFixture)).toEqual({
      valid: true,
    });

    expect(
      validateStripeMetadata({
        ...stripeOpaqueMetadataFixture,
        condition: "weight loss",
      }),
    ).toEqual({
      valid: false,
      offendingKey: "condition",
      reason: "disallowed_key",
    });

    expect(
      validateStripeMetadata({
        app_patient_id: "semaglutide candidate",
      }),
    ).toEqual({
      valid: false,
      offendingKey: "app_patient_id",
      reason: "phi_value",
    });
  });

  it("rejects webhooks with invalid signatures before idempotency handling", () => {
    const payload = JSON.stringify(stripeWebhookEventFixture);
    const secret = "whsec_test_secret";
    const timestamp = "1780000000";
    const signature = createHmac("sha256", secret)
      .update(`${timestamp}.${payload}`)
      .digest("hex");

    expect(
      verifyWebhookSignature({
        provider: "stripe",
        payload,
        secret,
        signatureHeader: `t=${timestamp},v1=${signature}`,
      }),
    ).toBe(true);

    expect(
      verifyWebhookSignature({
        provider: "stripe",
        payload,
        secret,
        signatureHeader: `t=${timestamp},v1=${"0".repeat(64)}`,
      }),
    ).toBe(false);
  });

  it("verifies MDI signatures over raw payload bytes", () => {
    const payload = Buffer.from(JSON.stringify(mdiClinicalApprovalEventFixture));
    const secret = "mdi_webhook_secret";
    const signature = createHmac("sha256", secret).update(payload).digest("hex");

    expect(
      verifyWebhookSignature({
        provider: "mdi",
        payload,
        secret,
        signatureHeader: `sha256=${signature}`,
      }),
    ).toBe(true);

    expect(
      verifyWebhookSignature({
        provider: "mdi",
        payload,
        secret,
        signatureHeader: "sha256=not-a-hex-digest",
      }),
    ).toBe(false);
  });

  it("makes duplicate webhook events a safe no-op and retryable failures explicit", () => {
    expect(decideWebhookIdempotency(null)).toEqual({
      action: "process",
      reason: "first_seen",
    });

    expect(
      decideWebhookIdempotency({
        provider: "mdi",
        eventId: "mdi_evt_approval_001",
        status: "processed",
        retryable: false,
      }),
    ).toEqual({ action: "skip", reason: "duplicate_processed" });

    expect(
      decideWebhookIdempotency({
        provider: "stripe",
        eventId: "evt_opaque_001",
        status: "failed",
        retryable: true,
      }),
    ).toEqual({ action: "retry", reason: "prior_retryable_failure" });
  });

  it("does not activate billing before the selected MDI clinical approval event", () => {
    expect(
      canActivateBilling(mdiCaseCreatedEventFixture, "payment_method_collected"),
    ).toBe(false);

    expect(
      canActivateBilling(
        mdiClinicalApprovalEventFixture,
        "payment_method_pending",
      ),
    ).toBe(false);

    expect(
      canActivateBilling(
        mdiClinicalApprovalEventFixture,
        "payment_method_collected",
      ),
    ).toBe(true);
  });
});
