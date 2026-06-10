import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { screenLightweightEligibility } from "@/lib/eligibility";
import { submitQuestionnaireAndDiscardAnswers } from "@/lib/mdi-questionnaire";
import { canActivateBilling } from "@/lib/payment-gating";
import { checkStateAvailability } from "@/lib/state-availability";
import { validateStripeMetadata } from "@/lib/stripe-policy";
import {
  claimWebhookEvent,
  createInMemoryAppDataRepository,
  markWebhookEventStatus,
} from "@/lib/dynamodb/app-data";
import {
  createWebhookQueueMessage,
  decideWebhookIdempotency,
  isWebhookQueueMessagePhiSafe,
  processVerifiedWebhook,
  type VerifiedWebhookEnvelope,
  verifyWebhookSignature,
  verifyWebhookEnvelope,
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

function simulateWebhookQueueRedrive(input: {
  maxReceiveCount: number;
  failures: number;
}): "retry" | "dlq" {
  return input.failures >= input.maxReceiveCount ? "dlq" : "retry";
}

async function verifyThenProcessWebhook(input: Parameters<typeof verifyWebhookEnvelope>[0] & {
  process: (envelope: VerifiedWebhookEnvelope) => Promise<unknown>;
}) {
  const verified = verifyWebhookEnvelope(input);
  if (!verified.ok) {
    return verified;
  }
  return input.process(verified.envelope);
}

function processTestWebhook(input: Parameters<typeof processVerifiedWebhook>[0]) {
  return processVerifiedWebhook({
    clock: () => input.now,
    ...input,
  });
}

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

  it("keeps invalid webhook signatures before repository, handler, or queue side effects", async () => {
    const payload = JSON.stringify(stripeWebhookEventFixture);
    const secret = "whsec_test_secret";
    const timestamp = "1780021400";
    const claim = vi.fn();
    const handler = vi.fn(async () => ({ outcome: "processed" as const }));
    const enqueue = vi.fn();

    const result = await verifyThenProcessWebhook({
      provider: "stripe",
      payload,
      secret,
      signatureHeader: `t=${timestamp},v1=${"0".repeat(64)}`,
      receivedAt: "2026-05-29T02:23:20.000Z",
      now: "2026-05-29T02:23:20.000Z",
      process: async (envelope) => processTestWebhook({
        envelope,
        now: "2026-05-29T02:23:20.000Z",
        repository: {
          claim,
          markProcessed: vi.fn(),
          markFailed: vi.fn(),
        },
        handler,
        enqueue,
      }),
    });

    expect(result).toEqual({ ok: false, reason: "invalid_signature" });
    expect(claim).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("rejects oversized webhook payloads before repository, handler, or queue side effects", async () => {
    const payload = JSON.stringify({
      id: "evt_opaque_oversized_001",
      type: "checkout.session.completed",
      data: "x".repeat(2048),
    });
    const secret = "whsec_test_secret";
    const timestamp = "1780021400";
    const signature = createHmac("sha256", secret)
      .update(`${timestamp}.${payload}`)
      .digest("hex");
    const claim = vi.fn();
    const handler = vi.fn(async () => ({ outcome: "processed" as const }));
    const enqueue = vi.fn();

    const result = await verifyThenProcessWebhook({
      provider: "stripe",
      payload,
      secret,
      signatureHeader: `t=${timestamp},v1=${signature}`,
      receivedAt: "2026-05-29T02:23:20.000Z",
      now: "2026-05-29T02:23:20.000Z",
      maxPayloadBytes: 256,
      process: async (envelope) => processTestWebhook({
        envelope,
        now: "2026-05-29T02:23:20.000Z",
        repository: {
          claim,
          markProcessed: vi.fn(),
          markFailed: vi.fn(),
        },
        handler,
        enqueue,
      }),
    });

    expect(result).toEqual({ ok: false, reason: "invalid_payload" });
    expect(claim).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("fails closed for blank webhook secrets before HMAC verification", () => {
    const payload = JSON.stringify(stripeWebhookEventFixture);
    const timestamp = "1780021400";
    const signature = createHmac("sha256", "")
      .update(`${timestamp}.${payload}`)
      .digest("hex");

    expect(
      verifyWebhookSignature({
        provider: "stripe",
        payload,
        secret: "   ",
        signatureHeader: `t=${timestamp},v1=${signature}`,
      }),
    ).toBe(false);

    expect(
      verifyWebhookEnvelope({
        provider: "stripe",
        payload,
        secret: "",
        signatureHeader: `t=${timestamp},v1=${signature}`,
        receivedAt: "2026-05-29T02:23:20.000Z",
        now: "2026-05-29T02:23:20.000Z",
      }),
    ).toEqual({ ok: false, reason: "invalid_signature" });
  });

  it("rejects stale signed Stripe payloads before repository work", () => {
    const payload = JSON.stringify({
      id: "evt_opaque_001",
      type: "checkout.session.completed",
      created: 1780000000,
    });
    const secret = "whsec_test_secret";
    const timestamp = "1780000000";
    const signature = createHmac("sha256", secret)
      .update(`${timestamp}.${payload}`)
      .digest("hex");

    expect(
      verifyWebhookEnvelope({
        provider: "stripe",
        payload,
        secret,
        signatureHeader: `t=${timestamp},v1=${signature}`,
        receivedAt: "2026-06-05T12:00:00.000Z",
        now: "2026-06-05T12:10:01.000Z",
      }),
    ).toEqual({ ok: false, reason: "stale_signature" });
  });

  it("rejects webhook envelopes with unsafe event IDs before persistence", () => {
    const secret = "mdi_webhook_secret";

    for (const eventId of [
      "mdi_evt_patient_email_name@test.com",
      "mdi_evt_hiv_positive_001",
      "mdi_evt_diabetes_001",
      "mdi_evt_cancer_001",
      "mdi_evt_asthma_001",
      "mdi_evt_hypertension_001",
      "mdi_evt_bearer_token_001",
      "mdi_evt_api_key_001",
    ]) {
      const payload = JSON.stringify({
        id: eventId,
        event_type: "case_created",
        occurred_at: "2026-06-05T12:00:00.000Z",
      });
      const signature = createHmac("sha256", secret).update(payload).digest("hex");

      expect(
        verifyWebhookEnvelope({
          provider: "mdi",
          payload,
          secret,
          signatureHeader: `sha256=${signature}`,
          receivedAt: "2026-06-05T12:00:02.000Z",
          now: "2026-06-05T12:00:02.000Z",
        }),
      ).toEqual({ ok: false, reason: "invalid_event_id" });
    }
  });

  it("rejects MDI webhooks without a provider timestamp", () => {
    const payload = JSON.stringify({
      id: "mdi_evt_missing_timestamp_001",
      event_type: "case_created",
    });
    const secret = "mdi_webhook_secret";
    const signature = createHmac("sha256", secret).update(payload).digest("hex");

    expect(
      verifyWebhookEnvelope({
        provider: "mdi",
        payload,
        secret,
        signatureHeader: `sha256=${signature}`,
        receivedAt: "2026-06-05T12:00:02.000Z",
        now: "2026-06-05T12:00:02.000Z",
      }),
    ).toEqual({ ok: false, reason: "missing_provider_timestamp" });
  });

  it("maps provider events into PHI-safe queue messages", () => {
    const payload = JSON.stringify({
      id: "mdi_evt_approval_001",
      event_type: "case_completed",
      occurred_at: "2026-06-05T12:00:00.000Z",
    });
    const secret = "mdi_webhook_secret";
    const signature = createHmac("sha256", secret).update(payload).digest("hex");

    const verified = verifyWebhookEnvelope({
      provider: "mdi",
      payload,
      secret,
      signatureHeader: `sha256=${signature}`,
      receivedAt: "2026-06-05T12:00:02.000Z",
      now: "2026-06-05T12:00:02.000Z",
    });

    expect(verified.ok && verified.envelope).toMatchObject({
      provider: "mdi",
      eventId: "mdi_evt_approval_001",
      eventCategory: "case",
      routeCode: "mdi.case",
    });

    if (!verified.ok) {
      throw new Error("expected webhook envelope to verify");
    }

    const message = createWebhookQueueMessage({
      envelope: verified.envelope,
      attempt: 2,
    });

    expect(message).toEqual({
      provider: "mdi",
      eventId: "mdi_evt_approval_001",
      eventCategory: "case",
      routeCode: "mdi.case",
      receivedAt: "2026-06-05T12:00:02.000Z",
      attempt: 2,
      correlationId: "mdi:mdi_evt_approval_001",
    });
    expect(JSON.stringify(message)).not.toContain("case_completed");
    expect(isWebhookQueueMessagePhiSafe(message)).toBe(true);
  });

  it("accepts documented MDI camelCase/event envelope fields", () => {
    const payload = JSON.stringify({
      eventId: "mdi_evt_case_created_001",
      event: "case_created",
      occurredAt: "2026-06-05T12:10:00.000Z",
    });
    const secret = "mdi_webhook_secret";
    const signature = createHmac("sha256", secret).update(payload).digest("hex");

    expect(
      verifyWebhookEnvelope({
        provider: "mdi",
        payload,
        secret,
        signatureHeader: `sha256=${signature}`,
        receivedAt: "2026-06-05T12:10:02.000Z",
        now: "2026-06-05T12:10:02.000Z",
      }),
    ).toEqual({
      ok: true,
      envelope: {
        provider: "mdi",
        eventId: "mdi_evt_case_created_001",
        eventCategory: "case",
        routeCode: "mdi.case",
        receivedAt: "2026-06-05T12:10:02.000Z",
        providerTimestamp: "2026-06-05T12:10:00.000Z",
      },
    });
  });

  it("accepts the launch MDI clinical approval event fixture", () => {
    const payload = JSON.stringify(mdiClinicalApprovalEventFixture);
    const secret = "mdi_webhook_secret";
    const signature = createHmac("sha256", secret).update(payload).digest("hex");

    expect(
      verifyWebhookEnvelope({
        provider: "mdi",
        payload,
        secret,
        signatureHeader: `sha256=${signature}`,
        receivedAt: "2026-06-05T12:30:02.000Z",
        now: "2026-06-05T12:30:02.000Z",
      }),
    ).toEqual({
      ok: true,
      envelope: {
        provider: "mdi",
        eventId: "mdi_evt_approval_001",
        eventCategory: "case",
        routeCode: "mdi.case",
        receivedAt: "2026-06-05T12:30:02.000Z",
        providerTimestamp: "2026-06-05T12:30:00.000Z",
      },
    });
  });

  it("rejects unsafe queue messages if minimized fields regress", () => {
    const unsafeEnvelope: VerifiedWebhookEnvelope = {
      provider: "mdi",
      eventId: "mdi_evt_patient_email_test_com",
      eventCategory: "case",
      routeCode: "mdi.case",
      receivedAt: "2026-06-05T12:00:02.000Z",
    };

    expect(
      isWebhookQueueMessagePhiSafe({
        provider: "mdi",
        eventId: "mdi_evt_001",
        eventCategory: "case",
        routeCode: "mdi.case",
        receivedAt: "2026-06-05T12:00:02.000Z",
        attempt: 1,
        correlationId: "mdi:clinical:semaglutide",
      }),
    ).toBe(false);
    expect(
      isWebhookQueueMessagePhiSafe({
        provider: "mdi",
        eventId: "mdi_evt_hiv_positive_001",
        eventCategory: "case",
        routeCode: "mdi.case",
        receivedAt: "2026-06-05T12:00:02.000Z",
        attempt: 1,
        correlationId: "mdi:mdi_evt_hiv_positive_001",
      }),
    ).toBe(false);
    expect(() =>
      createWebhookQueueMessage({
        envelope: unsafeEnvelope,
        attempt: 1,
      }),
    ).toThrow("Webhook queue message failed PHI safety validation");
    expect(() =>
      createWebhookQueueMessage({
        envelope: {
          ...unsafeEnvelope,
          eventId: "mdi_evt_diabetes_001",
        },
        attempt: 1,
      }),
    ).toThrow("Webhook queue message failed PHI safety validation");
  });

  it("uses the MDI replay window instead of Stripe's short signature tolerance", () => {
    const payload = JSON.stringify({
      id: "mdi_evt_retry_001",
      event_type: "case_created",
      occurred_at: "2026-06-05T12:00:00.000Z",
    });
    const secret = "mdi_webhook_secret";
    const signature = createHmac("sha256", secret).update(payload).digest("hex");

    expect(
      verifyWebhookEnvelope({
        provider: "mdi",
        payload,
        secret,
        signatureHeader: `sha256=${signature}`,
        receivedAt: "2026-06-06T11:59:00.000Z",
        now: "2026-06-06T11:59:00.000Z",
      }),
    ).toMatchObject({ ok: true });

    expect(
      verifyWebhookEnvelope({
        provider: "mdi",
        payload,
        secret,
        signatureHeader: `sha256=${signature}`,
        receivedAt: "2026-06-06T12:01:00.000Z",
        now: "2026-06-06T12:01:00.000Z",
      }),
    ).toEqual({ ok: false, reason: "stale_provider_timestamp" });
  });

  it("rejects MDI provider timestamps beyond clock skew in the future", () => {
    const payload = JSON.stringify({
      id: "mdi_evt_future_001",
      event_type: "case_created",
      occurred_at: "2026-06-05T12:06:00.000Z",
    });
    const secret = "mdi_webhook_secret";
    const signature = createHmac("sha256", secret).update(payload).digest("hex");

    expect(
      verifyWebhookEnvelope({
        provider: "mdi",
        payload,
        secret,
        signatureHeader: `sha256=${signature}`,
        receivedAt: "2026-06-05T12:00:00.000Z",
        now: "2026-06-05T12:00:00.000Z",
      }),
    ).toEqual({ ok: false, reason: "stale_provider_timestamp" });
  });

  it("allows delayed Stripe events when the signature timestamp is fresh", () => {
    const payload = JSON.stringify({
      id: "evt_opaque_001",
      type: "checkout.session.completed",
      created: 1780020800,
    });
    const secret = "whsec_test_secret";
    const timestamp = "1780021400";
    const signature = createHmac("sha256", secret)
      .update(`${timestamp}.${payload}`)
      .digest("hex");

    expect(
      verifyWebhookEnvelope({
        provider: "stripe",
        payload,
        secret,
        signatureHeader: `t=${timestamp},v1=${signature}`,
        receivedAt: "2026-05-29T02:23:20.000Z",
        now: "2026-05-29T02:23:20.000Z",
      }),
    ).toEqual({
      ok: true,
      envelope: {
        provider: "stripe",
        eventId: "evt_opaque_001",
        eventCategory: "billing",
        routeCode: "stripe.billing",
        receivedAt: "2026-05-29T02:23:20.000Z",
        providerTimestamp: "2026-05-29T02:13:20.000Z",
      },
    });
  });

  it("rejects ambiguous or oversized webhook signature headers", () => {
    const payload = JSON.stringify({
      id: "evt_opaque_001",
      type: "checkout.session.completed",
      created: 1780021400,
    });
    const secret = "whsec_test_secret";
    const timestamp = "1780021400";
    const signature = createHmac("sha256", secret)
      .update(`${timestamp}.${payload}`)
      .digest("hex");

    for (const signatureHeader of [
      `t=${timestamp},v1=${signature}=junk`,
      `t=${timestamp},v1=${signature},pad=${"a".repeat(2048)}`,
    ]) {
      expect(
        verifyWebhookEnvelope({
          provider: "stripe",
          payload,
          secret,
          signatureHeader,
          receivedAt: "2026-05-29T02:23:20.000Z",
          now: "2026-05-29T02:23:20.000Z",
        }),
      ).toEqual({ ok: false, reason: "invalid_signature" });
    }
  });

  it("does not acknowledge retryable webhooks as complete when enqueue fails", async () => {
    const envelope: VerifiedWebhookEnvelope = {
      provider: "stripe",
      eventId: "evt_opaque_001",
      eventCategory: "billing",
      routeCode: "stripe.billing",
      receivedAt: "2026-06-05T12:00:00.000Z",
    };
    const calls: string[] = [];

    const result = await processTestWebhook({
      envelope,
      now: "2026-06-05T12:00:00.000Z",
      repository: {
        claim: async () => ({
          outcome: "claimed",
          record: {
            provider: "stripe",
            eventId: "evt_opaque_001",
            status: "processing",
            retryable: false,
            attempts: 1,
          },
        }),
        markProcessed: async () => {
          calls.push("processed");
        },
        markFailed: async ({ retryOwner }) => {
          calls.push(`failed:${retryOwner}`);
        },
      },
      handler: async () => ({
        outcome: "failed",
        retryable: true,
        durableRetry: true,
        nextAttemptAfter: "2026-06-05T12:05:00.000Z",
        maxAttempts: 3,
      }),
      enqueue: async () => {
        throw new Error("sqs unavailable");
      },
    });

    expect(result).toEqual({ status: "retry", reason: "queue_send_failed" });
    expect(calls).toEqual(["failed:handoff", "failed:provider"]);
  });

  it("keeps provider retries active after a retryable state mark without a queue owner", async () => {
    const envelope: VerifiedWebhookEnvelope = {
      provider: "stripe",
      eventId: "evt_opaque_001",
      eventCategory: "billing",
      routeCode: "stripe.billing",
      receivedAt: "2026-06-05T12:00:00.000Z",
    };
    const handler = vi.fn(async () => ({ outcome: "processed" as const }));
    const enqueue = vi.fn();
    const markProcessed = vi.fn();
    const markFailed = vi.fn();

    await expect(
      processTestWebhook({
        envelope,
        now: "2026-06-05T12:01:00.000Z",
        repository: {
          claim: async () => ({
            outcome: "retryNotDue",
            record: {
              provider: "stripe",
              eventId: "evt_opaque_001",
              status: "failed",
              retryable: true,
              retryOwner: "provider",
              attempts: 1,
            },
          }),
          markProcessed,
          markFailed,
        },
        handler,
        enqueue,
      }),
    ).resolves.toEqual({ status: "retry", reason: "retry_not_due" });

    expect(handler).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
    expect(markProcessed).not.toHaveBeenCalled();
    expect(markFailed).not.toHaveBeenCalled();
  });

  it("acknowledges durable retry only after successful queue enqueue", async () => {
    const envelope: VerifiedWebhookEnvelope = {
      provider: "stripe",
      eventId: "evt_opaque_001",
      eventCategory: "billing",
      routeCode: "stripe.billing",
      receivedAt: "2026-06-05T12:00:00.000Z",
    };
    const calls: string[] = [];

    const result = await processTestWebhook({
      envelope,
      now: "2026-06-05T12:00:00.000Z",
      repository: {
        claim: async () => ({
          outcome: "claimed",
          record: {
            provider: "stripe",
            eventId: "evt_opaque_001",
            status: "processing",
            retryable: false,
            attempts: 1,
          },
        }),
        markProcessed: async () => {
          calls.push("processed");
        },
        markFailed: async ({ expectedAttempts, retryOwner }) => {
          calls.push(`failed:${expectedAttempts}:${retryOwner}`);
        },
      },
      handler: async () => ({
        outcome: "failed",
        retryable: true,
        durableRetry: true,
        nextAttemptAfter: "2026-06-05T12:05:00.000Z",
        maxAttempts: 3,
      }),
      enqueue: async (message) => {
        calls.push(`enqueued:${message.correlationId}`);
      },
    });

    expect(result).toEqual({ status: "accepted", action: "queued" });
    expect(calls).toEqual([
      "failed:1:handoff",
      "enqueued:stripe:evt_opaque_001",
      "failed:1:queue",
    ]);
  });

  it("acknowledges provider redelivery after SQS owns durable retry", async () => {
    const repository = createInMemoryAppDataRepository();
    const envelope: VerifiedWebhookEnvelope = {
      provider: "stripe",
      eventId: "evt_opaque_queue_owner_001",
      eventCategory: "billing",
      routeCode: "stripe.billing",
      receivedAt: "2026-06-05T12:00:00.000Z",
    };
    const handler = vi.fn(async () => ({
      outcome: "failed" as const,
      retryable: true,
      durableRetry: true,
      nextAttemptAfter: "2026-06-05T12:05:00.000Z",
      maxAttempts: 3,
    }));
    const enqueue = vi.fn(async () => {});
    const statefulRepository = {
      claim: async (input: Parameters<typeof claimWebhookEvent>[1]) => {
        const claimed = claimWebhookEvent(repository, input);
        if (!claimed.ok) {
          throw new Error(claimed.error.message);
        }
        return claimed.value;
      },
      markProcessed: async (
        input: Omit<Parameters<typeof markWebhookEventStatus>[1], "status" | "retryable">,
      ) => {
        const marked = markWebhookEventStatus(repository, {
          ...input,
          status: "processed",
          retryable: false,
        });
        if (!marked.ok) {
          throw new Error(marked.error.message);
        }
      },
      markFailed: async (
        input: Omit<Parameters<typeof markWebhookEventStatus>[1], "status">,
      ) => {
        const marked = markWebhookEventStatus(repository, {
          ...input,
          status: "failed",
        });
        if (!marked.ok) {
          throw new Error(marked.error.message);
        }
      },
    };

    await expect(
      processTestWebhook({
        envelope,
        now: "2026-06-05T12:00:00.000Z",
        repository: statefulRepository,
        handler,
        enqueue,
      }),
    ).resolves.toEqual({ status: "accepted", action: "queued" });

    handler.mockClear();
    enqueue.mockClear();

    await expect(
      processTestWebhook({
        envelope,
        now: "2026-06-05T12:01:00.000Z",
        repository: statefulRepository,
        handler,
        enqueue,
      }),
    ).resolves.toEqual({ status: "accepted", action: "skipped" });

    expect(handler).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();

    await expect(
      processTestWebhook({
        envelope,
        now: "2026-06-05T12:05:00.000Z",
        deliverySource: "queue",
        queueMessageAttempt: 1,
        repository: statefulRepository,
        handler,
        enqueue,
      }),
    ).resolves.toEqual({ status: "retry", reason: "handler_retryable_failure" });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("lets provider deliveries reclaim handoff-owned retries without a queue owner", async () => {
    const envelope: VerifiedWebhookEnvelope = {
      provider: "stripe",
      eventId: "evt_opaque_handoff_001",
      eventCategory: "billing",
      routeCode: "stripe.billing",
      receivedAt: "2026-06-05T12:00:00.000Z",
    };
    const handler = vi.fn(async () => ({ outcome: "processed" as const }));
    const enqueue = vi.fn();

    await expect(
      processTestWebhook({
        envelope,
        now: "2026-06-05T12:01:00.000Z",
        repository: {
          claim: async () => ({
            outcome: "failedRetryable",
            record: {
              provider: "stripe",
              eventId: "evt_opaque_handoff_001",
              status: "processing",
              retryable: false,
              attempts: 2,
            },
          }),
          markProcessed: async () => {},
          markFailed: async () => {},
        },
        handler,
        enqueue,
      }),
    ).resolves.toEqual({ status: "accepted", action: "processed" });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("rejects webhook completion after the processing lease expires", async () => {
    const repository = createInMemoryAppDataRepository();
    const envelope: VerifiedWebhookEnvelope = {
      provider: "stripe",
      eventId: "evt_opaque_expired_completion_001",
      eventCategory: "billing",
      routeCode: "stripe.billing",
      receivedAt: "2026-06-05T12:00:00.000Z",
    };
    const statefulRepository = {
      claim: async (input: Parameters<typeof claimWebhookEvent>[1]) => {
        const claimed = claimWebhookEvent(repository, {
          ...input,
          processingLeaseSeconds: 60,
        });
        if (!claimed.ok) {
          throw new Error(claimed.error.message);
        }
        return claimed.value;
      },
      markProcessed: async (
        input: Omit<Parameters<typeof markWebhookEventStatus>[1], "status" | "retryable">,
      ) => {
        const marked = markWebhookEventStatus(repository, {
          ...input,
          status: "processed",
          retryable: false,
        });
        if (!marked.ok) {
          throw new Error(marked.error.message);
        }
      },
      markFailed: async (
        input: Omit<Parameters<typeof markWebhookEventStatus>[1], "status">,
      ) => {
        const marked = markWebhookEventStatus(repository, {
          ...input,
          status: "failed",
        });
        if (!marked.ok) {
          throw new Error(marked.error.message);
        }
      },
    };

    await expect(
      processVerifiedWebhook({
        envelope,
        now: "2026-06-05T12:00:00.000Z",
        clock: () => "2026-06-05T12:01:01.000Z",
        repository: statefulRepository,
        handler: async () => ({ outcome: "processed" }),
      }),
    ).rejects.toThrow("Webhook claim is no longer current");
  });

  it("passes custom processing lease seconds through the webhook repository claim", async () => {
    const envelope: VerifiedWebhookEnvelope = {
      provider: "stripe",
      eventId: "evt_opaque_custom_lease_001",
      eventCategory: "billing",
      routeCode: "stripe.billing",
      receivedAt: "2026-06-05T12:00:00.000Z",
    };
    const claim = vi.fn(async () => ({
      outcome: "claimed" as const,
      record: {
        provider: "stripe" as const,
        eventId: "evt_opaque_custom_lease_001",
        status: "processing" as const,
        retryable: false,
        attempts: 1,
        processingExpiresAt: "2026-06-05T12:02:00.000Z",
      },
    }));

    await expect(
      processTestWebhook({
        envelope,
        now: "2026-06-05T12:00:00.000Z",
        deliverySource: "queue",
        queueMessageAttempt: 2,
        processingLeaseSeconds: 120,
        repository: {
          claim,
          markProcessed: async () => {},
          markFailed: async () => {},
        },
        handler: async () => ({ outcome: "processed" }),
      }),
    ).resolves.toEqual({ status: "accepted", action: "processed" });

    expect(claim).toHaveBeenCalledWith({
      provider: "stripe",
      eventId: "evt_opaque_custom_lease_001",
      now: "2026-06-05T12:00:00.000Z",
      deliverySource: "queue",
      expectedAttempts: 2,
      processingLeaseSeconds: 120,
      maxAttempts: 3,
    });
  });

  it("reports queue-owner promotion failures after enqueue without reprocessing", async () => {
    const envelope: VerifiedWebhookEnvelope = {
      provider: "stripe",
      eventId: "evt_opaque_001",
      eventCategory: "billing",
      routeCode: "stripe.billing",
      receivedAt: "2026-06-05T12:00:00.000Z",
    };
    const calls: string[] = [];

    const result = await processTestWebhook({
      envelope,
      now: "2026-06-05T12:00:00.000Z",
      repository: {
        claim: async () => ({
          outcome: "claimed",
          record: {
            provider: "stripe",
            eventId: "evt_opaque_001",
            status: "processing",
            retryable: false,
            attempts: 1,
          },
        }),
        markProcessed: async () => {},
        markFailed: async ({ retryOwner }) => {
          calls.push(`failed:${retryOwner}`);
          if (retryOwner === "queue") {
            throw new Error("dynamodb unavailable after enqueue");
          }
        },
      },
      handler: async () => ({
        outcome: "failed",
        retryable: true,
        durableRetry: true,
        nextAttemptAfter: "2026-06-05T12:05:00.000Z",
        maxAttempts: 3,
      }),
      enqueue: async () => {
        calls.push("enqueued");
      },
    });

    expect(result).toEqual({ status: "retry", reason: "queue_owner_mark_failed" });
    expect(calls).toEqual(["failed:handoff", "enqueued", "failed:queue"]);
  });

  it("does not hide enqueue failures when provider ownership cannot be restored", async () => {
    const envelope: VerifiedWebhookEnvelope = {
      provider: "stripe",
      eventId: "evt_opaque_001",
      eventCategory: "billing",
      routeCode: "stripe.billing",
      receivedAt: "2026-06-05T12:00:00.000Z",
    };
    const calls: string[] = [];

    await expect(
      processTestWebhook({
        envelope,
        now: "2026-06-05T12:00:00.000Z",
        repository: {
          claim: async () => ({
            outcome: "claimed",
            record: {
              provider: "stripe",
              eventId: "evt_opaque_001",
              status: "processing",
              retryable: false,
              attempts: 1,
            },
          }),
          markProcessed: async () => {},
          markFailed: async ({ retryOwner }) => {
            calls.push(`failed:${retryOwner}`);
            if (retryOwner === "provider") {
              throw new Error("provider restore unavailable");
            }
          },
        },
        handler: async () => ({
          outcome: "failed",
          retryable: true,
          durableRetry: true,
          nextAttemptAfter: "2026-06-05T12:05:00.000Z",
          maxAttempts: 3,
        }),
        enqueue: async () => {
          throw new Error("sqs unavailable");
        },
      }),
    ).rejects.toThrow("provider restore unavailable");

    expect(calls).toEqual(["failed:handoff", "failed:provider"]);
  });

  it("does not enqueue durable retry if retry state cannot be persisted", async () => {
    const envelope: VerifiedWebhookEnvelope = {
      provider: "stripe",
      eventId: "evt_opaque_001",
      eventCategory: "billing",
      routeCode: "stripe.billing",
      receivedAt: "2026-06-05T12:00:00.000Z",
    };
    const enqueue = vi.fn();

    await expect(
      processTestWebhook({
        envelope,
        now: "2026-06-05T12:00:00.000Z",
        repository: {
          claim: async () => ({
            outcome: "claimed",
            record: {
              provider: "stripe",
              eventId: "evt_opaque_001",
              status: "processing",
              retryable: false,
              attempts: 1,
            },
          }),
          markProcessed: async () => {},
          markFailed: async () => {
            throw new Error("dynamodb unavailable");
          },
        },
        handler: async () => ({
          outcome: "failed",
          retryable: true,
          durableRetry: true,
          nextAttemptAfter: "2026-06-05T12:05:00.000Z",
          maxAttempts: 3,
        }),
        enqueue,
      }),
    ).rejects.toThrow("dynamodb unavailable");

    expect(enqueue).not.toHaveBeenCalled();
  });

  it("includes not-before time in durable retry queue messages", async () => {
    const envelope: VerifiedWebhookEnvelope = {
      provider: "stripe",
      eventId: "evt_opaque_001",
      eventCategory: "billing",
      routeCode: "stripe.billing",
      receivedAt: "2026-06-05T12:00:00.000Z",
    };
    const messages: unknown[] = [];

    const result = await processTestWebhook({
      envelope,
      now: "2026-06-05T12:00:00.000Z",
      repository: {
        claim: async () => ({
          outcome: "claimed",
          record: {
            provider: "stripe",
            eventId: "evt_opaque_001",
            status: "processing",
            retryable: false,
            attempts: 1,
            processingExpiresAt: "2026-06-05T12:05:00.000Z",
          },
        }),
        markProcessed: async () => {},
        markFailed: async () => {},
      },
      handler: async () => ({
        outcome: "failed",
        retryable: true,
        durableRetry: true,
        nextAttemptAfter: "2026-06-05T12:05:00.000Z",
        maxAttempts: 3,
      }),
      enqueue: async (message) => {
        messages.push(message);
      },
    });

    expect(result).toEqual({ status: "accepted", action: "queued" });
    expect(messages).toEqual([
      {
        provider: "stripe",
        eventId: "evt_opaque_001",
        eventCategory: "billing",
        routeCode: "stripe.billing",
        receivedAt: "2026-06-05T12:00:00.000Z",
        notBefore: "2026-06-05T12:05:00.000Z",
        attempt: 1,
        correlationId: "stripe:evt_opaque_001",
      },
    ]);
  });

  it("acknowledges processed duplicates without side effects", async () => {
    const envelope: VerifiedWebhookEnvelope = {
      provider: "stripe",
      eventId: "evt_opaque_001",
      eventCategory: "billing",
      routeCode: "stripe.billing",
      receivedAt: "2026-06-05T12:00:00.000Z",
    };
    const handler = vi.fn();

    const enqueue = vi.fn();
    const markProcessed = vi.fn();
    const markFailed = vi.fn();

    await expect(
      processTestWebhook({
        envelope,
        now: "2026-06-05T12:00:00.000Z",
        repository: {
          claim: async () => ({
            outcome: "alreadyProcessed",
            record: {
              provider: "stripe",
              eventId: "evt_opaque_001",
              status: "processed",
              retryable: false,
              attempts: 1,
            },
          }),
          markProcessed,
          markFailed,
        },
        handler,
        enqueue,
      }),
    ).resolves.toEqual({ status: "accepted", action: "skipped" });

    expect(handler).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
    expect(markProcessed).not.toHaveBeenCalled();
    expect(markFailed).not.toHaveBeenCalled();
  });

  it("returns retry for active in-flight duplicate deliveries", async () => {
    const envelope: VerifiedWebhookEnvelope = {
      provider: "stripe",
      eventId: "evt_opaque_001",
      eventCategory: "billing",
      routeCode: "stripe.billing",
      receivedAt: "2026-06-05T12:00:00.000Z",
    };
    const handler = vi.fn();
    const enqueue = vi.fn();
    const markProcessed = vi.fn();
    const markFailed = vi.fn();

    await expect(
      processTestWebhook({
        envelope,
        now: "2026-06-05T12:00:00.000Z",
        repository: {
          claim: async () => ({
            outcome: "alreadyProcessing",
            record: {
              provider: "stripe",
              eventId: "evt_opaque_001",
              status: "processing",
              retryable: false,
              attempts: 1,
            },
          }),
          markProcessed,
          markFailed,
        },
        handler,
        enqueue,
      }),
    ).resolves.toEqual({ status: "retry", reason: "already_processing" });

    expect(handler).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
    expect(markProcessed).not.toHaveBeenCalled();
    expect(markFailed).not.toHaveBeenCalled();
  });

  it("acknowledges terminal claim outcomes without side effects", async () => {
    const envelope: VerifiedWebhookEnvelope = {
      provider: "stripe",
      eventId: "evt_opaque_001",
      eventCategory: "billing",
      routeCode: "stripe.billing",
      receivedAt: "2026-06-05T12:00:00.000Z",
    };
    const handler = vi.fn();
    const enqueue = vi.fn();
    const markProcessed = vi.fn();
    const markFailed = vi.fn();

    for (const outcome of ["retryExhausted", "conflict"] as const) {
      await expect(
        processTestWebhook({
          envelope,
          now: "2026-06-05T12:00:00.000Z",
          repository: {
            claim: async () => ({
              outcome,
              record: {
                provider: "stripe",
                eventId: "evt_opaque_001",
                status: "failed",
                retryable: false,
                attempts: 3,
              },
            }),
            markProcessed,
            markFailed,
          },
          handler,
          enqueue,
        }),
      ).resolves.toEqual({ status: "accepted", action: "terminal_failed" });
    }

    expect(handler).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
    expect(markProcessed).not.toHaveBeenCalled();
    expect(markFailed).not.toHaveBeenCalled();
  });

  it("returns retry for queue-sourced retry exhaustion so SQS can redrive", async () => {
    const envelope: VerifiedWebhookEnvelope = {
      provider: "stripe",
      eventId: "evt_opaque_001",
      eventCategory: "billing",
      routeCode: "stripe.billing",
      receivedAt: "2026-06-05T12:00:00.000Z",
    };
    const handler = vi.fn();
    const enqueue = vi.fn();
    const markProcessed = vi.fn();
    const markFailed = vi.fn();

    await expect(
      processTestWebhook({
        envelope,
        now: "2026-06-05T12:00:00.000Z",
        deliverySource: "queue",
        queueMessageAttempt: 3,
        repository: {
          claim: async () => ({
            outcome: "retryExhausted",
            record: {
              provider: "stripe",
              eventId: "evt_opaque_001",
              status: "failed",
              retryable: false,
              retryOwner: "queue",
              attempts: 3,
            },
          }),
          markProcessed,
          markFailed,
        },
        handler,
        enqueue,
      }),
    ).resolves.toEqual({ status: "retry", reason: "queue_retry_exhausted" });

    expect(handler).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
    expect(markProcessed).not.toHaveBeenCalled();
    expect(markFailed).not.toHaveBeenCalled();
  });

  it("normalizes thrown webhook handlers into retryable failures", async () => {
    const envelope: VerifiedWebhookEnvelope = {
      provider: "stripe",
      eventId: "evt_opaque_001",
      eventCategory: "billing",
      routeCode: "stripe.billing",
      receivedAt: "2026-06-05T12:00:00.000Z",
    };
    const calls: string[] = [];

    const result = await processTestWebhook({
      envelope,
      now: "2026-06-05T12:00:00.000Z",
      repository: {
        claim: async () => ({
          outcome: "claimed",
          record: {
            provider: "stripe",
            eventId: "evt_opaque_001",
            status: "processing",
            retryable: false,
            attempts: 4,
          },
        }),
        markProcessed: async () => {
          calls.push("processed");
        },
        markFailed: async ({ retryable, expectedAttempts, nextAttemptAfter }) => {
          calls.push(`failed:${retryable}:${expectedAttempts}:${nextAttemptAfter}`);
        },
      },
      handler: async () => {
        throw new Error("vendor timeout");
      },
    });

    expect(result).toEqual({
      status: "retry",
      reason: "handler_retryable_failure",
    });
    expect(calls).toEqual(["failed:true:4:2026-06-05T12:05:00.000Z"]);
  });

  it("acknowledges terminal webhook failures after marking non-retryable", async () => {
    const envelope: VerifiedWebhookEnvelope = {
      provider: "stripe",
      eventId: "evt_opaque_001",
      eventCategory: "billing",
      routeCode: "stripe.billing",
      receivedAt: "2026-06-05T12:00:00.000Z",
    };

    const result = await processTestWebhook({
      envelope,
      now: "2026-06-05T12:00:00.000Z",
      repository: {
        claim: async () => ({
          outcome: "claimed",
          record: {
            provider: "stripe",
            eventId: "evt_opaque_001",
            status: "processing",
            retryable: false,
            attempts: 1,
          },
        }),
        markProcessed: async () => {},
        markFailed: async ({ retryable, expectedAttempts }) => {
          expect(retryable).toBe(false);
          expect(expectedAttempts).toBe(1);
        },
      },
      handler: async () => ({
        outcome: "failed",
        retryable: false,
        durableRetry: false,
      }),
    });

    expect(result).toEqual({ status: "accepted", action: "terminal_failed" });
  });

  it("models queue redrive exhaustion for retryable webhook failures", () => {
    expect(simulateWebhookQueueRedrive({ maxReceiveCount: 3, failures: 2 })).toBe(
      "retry",
    );
    expect(simulateWebhookQueueRedrive({ maxReceiveCount: 3, failures: 3 })).toBe(
      "dlq",
    );
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
        nextAttemptAfter: "2026-06-05T12:10:00.000Z",
      }),
    ).toEqual({ action: "retry", reason: "prior_retryable_failure" });

    expect(
      decideWebhookIdempotency(
        {
          provider: "stripe",
          eventId: "evt_opaque_001",
          status: "failed",
          retryable: true,
          nextAttemptAfter: "2026-06-05T12:10:00.000Z",
        },
        "2026-06-05T12:00:00.000Z",
      ),
    ).toEqual({ action: "retry_later", reason: "prior_retry_not_due" });

    expect(
      decideWebhookIdempotency(
        {
          provider: "stripe",
          eventId: "evt_opaque_queue_001",
          status: "failed",
          retryable: true,
          retryOwner: "queue",
          nextAttemptAfter: "2026-06-05T12:10:00.000Z",
        },
        "2026-06-05T12:00:00.000Z",
      ),
    ).toEqual({ action: "skip", reason: "queue_owned_retry" });

    expect(
      decideWebhookIdempotency(
        {
          provider: "stripe",
          eventId: "evt_opaque_queue_001",
          status: "failed",
          retryable: true,
          retryOwner: "queue",
          nextAttemptAfter: "2026-06-05T12:10:00.000Z",
        },
        "2026-06-05T12:00:00.000Z",
        "queue",
      ),
    ).toEqual({ action: "retry", reason: "prior_retryable_failure" });

    expect(
      decideWebhookIdempotency(
        {
          provider: "stripe",
          eventId: "evt_opaque_001",
          status: "processing",
          retryable: false,
          processingExpiresAt: "2026-06-05T07:59:00.000-04:00",
        },
        "2026-06-05T12:00:00.000Z",
      ),
    ).toEqual({ action: "retry", reason: "stale_processing" });
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
