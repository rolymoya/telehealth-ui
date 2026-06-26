import { describe, expect, it, vi } from "vitest";
import {
  createInMemoryAppDataRepository,
  createPatientProfileRecord,
  getStripeLinkage,
  linkMdiPatientCase,
  linkStripeCustomer,
  listEvidenceEventsForPatient,
} from "@/lib/dynamodb/app-data";
import {
  createInMemoryStripeRefundProcessingRepository,
  processStripeRefundEvent,
  processQueuedStripeRefundEvent,
  type StripeRefundProcessingEvent,
} from "@/lib/stripe-refund-processing";

const cognitoSub = "cognito-sub-refundprocessing";
const mdiPatientId = "mdi_patient_refundprocessing_001";
const mdiCaseId = "mdi_case_refundprocessing_001";
const now = "2026-06-26T16:00:00.000Z";

describe("Stripe refund and dispute processing", () => {
  it("records bounded manual-review evidence for external refund events without mutating billing linkage", async () => {
    const repository = seededRepository();

    const result = await processStripeRefundEvent({
      event: refundEvent({
        eventFamily: "refund",
        eventId: "evt_refund_external_001",
        eventStatus: "pending",
      }),
      now,
      repository: createInMemoryStripeRefundProcessingRepository(repository),
    });

    expect(result).toEqual({ ok: true, status: "recorded" });
    expect(getStripeLinkage(repository, cognitoSub)).toMatchObject({
      ok: true,
      value: {
        billingStatus: "active",
        stripeCustomerId: "cus_refund_001",
        stripeSubscriptionId: "sub_refund_001",
      },
    });
    const evidence = refundEvidence(repository);
    expect(evidence).toEqual([
      expect.objectContaining({
        eventId: "stripe:refund:sub_refund_001:refund:re_refund_001:evt_refund_external_001",
        eventType: "stripe_refund_status_changed",
        metadata: {
          refund_action: "manual_review",
          refund_scenario: "external_refund_event",
          refund_status: "refund_pending_review",
          review_requirement: "support_approval",
          stripe_event_family: "refund",
          stripe_event_status: "pending",
        },
        stripeCustomerId: "cus_refund_001",
        stripeSubscriptionId: "sub_refund_001",
      }),
    ]);
    expect(JSON.stringify(evidence)).not.toMatch(
      /clinical|diagnosis|symptom|medication|questionnaire|answer|note|payload|SECRET_MDI_WORKFLOW_TOKEN/i,
    );
  });

  it("maps explicit launch refund scenarios to the approved contract action", async () => {
    const repository = seededRepository();

    await expect(processStripeRefundEvent({
      event: refundEvent({
        eventFamily: "charge_refunded",
        eventId: "evt_refund_prereview_001",
        eventStatus: "pending",
        refundScenario: "before_clinician_review",
      }),
      now,
      repository: createInMemoryStripeRefundProcessingRepository(repository),
    })).resolves.toEqual({ ok: true, status: "recorded" });

    expect(refundEvidence(repository)).toEqual([
      expect.objectContaining({
        metadata: expect.objectContaining({
          refund_action: "full_refund",
          refund_scenario: "before_clinician_review",
          refund_status: "refund_approved",
          review_requirement: "none",
        }),
      }),
    ]);
  });

  it("treats duplicate refund events as idempotent and skips older status transitions", async () => {
    const repository = seededRepository();
    const processor = createInMemoryStripeRefundProcessingRepository(repository);

    await expect(processStripeRefundEvent({
      event: refundEvent({
        eventFamily: "refund",
        eventId: "evt_refund_duplicate_001",
        eventStatus: "succeeded",
        stripeObjectId: "re_duplicate_001",
      }),
      now,
      repository: processor,
    })).resolves.toEqual({ ok: true, status: "recorded" });
    await expect(processStripeRefundEvent({
      event: refundEvent({
        eventFamily: "refund",
        eventId: "evt_refund_duplicate_001",
        eventStatus: "succeeded",
        stripeObjectId: "re_duplicate_001",
      }),
      now: "2026-06-26T16:01:00.000Z",
      repository: processor,
    })).resolves.toEqual({ ok: true, status: "out_of_order" });
    await expect(processStripeRefundEvent({
      event: refundEvent({
        eventFamily: "refund",
        eventId: "evt_refund_pending_late_001",
        eventStatus: "pending",
        stripeObjectId: "re_duplicate_001",
      }),
      now: "2026-06-26T16:02:00.000Z",
      repository: processor,
    })).resolves.toEqual({ ok: true, status: "out_of_order" });

    expect(refundEvidence(repository)).toHaveLength(1);
    expect(refundEvidence(repository)[0]).toMatchObject({
      metadata: {
        refund_action: "no_op",
        refund_scenario: "external_refund_event",
        refund_status: "refund_completed",
        review_requirement: "support_approval",
        stripe_event_family: "refund",
        stripe_event_status: "succeeded",
      },
    });
  });

  it("does not treat a separate refund object as out-of-order after a completed refund", async () => {
    const repository = seededRepository();
    const processor = createInMemoryStripeRefundProcessingRepository(repository);

    await expect(processStripeRefundEvent({
      event: refundEvent({
        eventId: "evt_refund_first_001",
        eventStatus: "succeeded",
        stripeObjectId: "re_first_001",
      }),
      now,
      repository: processor,
    })).resolves.toEqual({ ok: true, status: "recorded" });
    await expect(processStripeRefundEvent({
      event: refundEvent({
        eventId: "evt_refund_second_001",
        eventStatus: "pending",
        stripeObjectId: "re_second_001",
      }),
      now: "2026-06-26T16:01:00.000Z",
      repository: processor,
    })).resolves.toEqual({ ok: true, status: "recorded" });

    expect(refundEvidence(repository)).toHaveLength(2);
    expect(refundEvidence(repository).map((event) => event.eventId).sort()).toEqual([
      "stripe:refund:sub_refund_001:refund:re_first_001:evt_refund_first_001",
      "stripe:refund:sub_refund_001:refund:re_second_001:evt_refund_second_001",
    ]);
  });

  it("does not record evidence when the Stripe subscription does not match the local mirror", async () => {
    const repository = seededRepository();

    await expect(processStripeRefundEvent({
      event: refundEvent({
        eventFamily: "refund",
        eventId: "evt_refund_wrong_sub_001",
        eventStatus: "pending",
        stripeSubscriptionId: "sub_refund_other_001",
      }),
      now,
      repository: createInMemoryStripeRefundProcessingRepository(repository),
    })).resolves.toEqual({ ok: true, status: "subscription_mismatch" });

    expect(refundEvidence(repository)).toEqual([]);
    expect(getStripeLinkage(repository, cognitoSub)).toMatchObject({
      ok: true,
      value: { billingStatus: "active", stripeSubscriptionId: "sub_refund_001" },
    });
  });

  it("skips unpaired Stripe customers without leaking customer identifiers into evidence", async () => {
    const repository = seededRepository();

    await expect(processStripeRefundEvent({
      event: refundEvent({
        eventFamily: "dispute",
        eventId: "evt_refund_unpaired_001",
        eventStatus: "requires_review",
        stripeCustomerId: "cus_refund_unpaired_001",
      }),
      now,
      repository: createInMemoryStripeRefundProcessingRepository(repository),
    })).resolves.toEqual({ ok: true, status: "no_patient" });

    expect(refundEvidence(repository)).toEqual([]);
  });

  it("converts queue-resolved raw Stripe refund events into bounded refund evidence", async () => {
    const repository = seededRepository();
    const resolveStripePointer = vi.fn(async () => ({
      ok: true as const,
      value: {
        stripeCustomerId: "cus_refund_001",
        stripeSubscriptionId: "sub_refund_001",
      },
    }));

    await expect(processQueuedStripeRefundEvent({
      event: {
        created: 1782470400,
        data: {
          object: {
            charge: "ch_opaque_001",
            id: "re_opaque_001",
            status: "succeeded",
          },
        },
        id: "evt_refund_updated_001",
        type: "refund.updated",
      } as never,
      now,
      repository: createInMemoryStripeRefundProcessingRepository(repository),
      resolveStripePointer,
    })).resolves.toEqual({ ok: true, status: "recorded" });

    expect(resolveStripePointer).toHaveBeenCalledWith(expect.objectContaining({
      chargeId: "ch_opaque_001",
      eventFamily: "refund",
      stripeObjectId: "re_opaque_001",
    }));
    expect(refundEvidence(repository)).toEqual([
      expect.objectContaining({
        eventId: "stripe:refund:sub_refund_001:refund:re_opaque_001:evt_refund_updated_001",
        metadata: expect.objectContaining({
          refund_action: "no_op",
          refund_status: "refund_completed",
          stripe_event_family: "refund",
          stripe_event_status: "succeeded",
        }),
      }),
    ]);
  });

  it("does not infer a subscription from a customer-only queued charge refund", async () => {
    const repository = seededRepository();

    await expect(processQueuedStripeRefundEvent({
      event: {
        created: 1782470400,
        data: {
          object: {
            customer: "cus_refund_001",
            id: "ch_opaque_refund_001",
          },
        },
        id: "evt_charge_refunded_001",
        type: "charge.refunded",
      } as never,
      now,
      repository: createInMemoryStripeRefundProcessingRepository(repository),
    })).resolves.toEqual({ ok: true, status: "unresolved_pointer" });

    expect(refundEvidence(repository)).toEqual([]);
    expect(getStripeLinkage(repository, cognitoSub)).toMatchObject({
      ok: true,
      value: { billingStatus: "active", stripeSubscriptionId: "sub_refund_001" },
    });
  });

  it("converts queue-resolved raw Stripe dispute events into bounded review evidence", async () => {
    const repository = seededRepository();

    await expect(processQueuedStripeRefundEvent({
      event: {
        created: 1782470400,
        data: {
          object: {
            charge: "ch_opaque_dispute_001",
            id: "dp_opaque_001",
            status: "needs_response",
          },
        },
        id: "evt_dispute_created_001",
        type: "charge.dispute.created",
      } as never,
      now,
      repository: createInMemoryStripeRefundProcessingRepository(repository),
      resolveStripePointer: vi.fn(async () => ({
        ok: true as const,
        value: {
          stripeCustomerId: "cus_refund_001",
          stripeSubscriptionId: "sub_refund_001",
        },
      })),
    })).resolves.toEqual({ ok: true, status: "recorded" });

    expect(refundEvidence(repository)).toEqual([
      expect.objectContaining({
        eventId: "stripe:refund:sub_refund_001:dispute:dp_opaque_001:evt_dispute_created_001",
        metadata: expect.objectContaining({
          refund_action: "manual_review",
          refund_status: "refund_pending_review",
          stripe_event_family: "dispute",
          stripe_event_status: "requires_review",
        }),
      }),
    ]);
  });
});

function seededRepository() {
  const repository = createInMemoryAppDataRepository([
    createPatientProfileRecord({
      cognitoSub,
      now,
      onboardingStatus: "billing_ready",
      residencyState: "IL",
    }),
  ]);
  expect(linkMdiPatientCase(repository, {
    cognitoSub,
    mdiCaseId,
    mdiPatientId,
    now,
  }).ok).toBe(true);
  expect(linkStripeCustomer(repository, {
    billingStatus: "active",
    cognitoSub,
    now,
    stripeBillingStatusObservedAt: now,
    stripeCustomerId: "cus_refund_001",
    stripeCurrentPeriodEnd: "2026-07-26T16:00:00.000Z",
    stripeCurrentPeriodStart: now,
    stripeSubscriptionId: "sub_refund_001",
  }).ok).toBe(true);
  return repository;
}

function refundEvent(
  input: Partial<StripeRefundProcessingEvent>,
): StripeRefundProcessingEvent {
  return {
    eventFamily: "refund",
    eventId: "evt_refund_001",
    eventStatus: "pending",
    occurredAt: now,
    stripeCustomerId: "cus_refund_001",
    stripeObjectId: "re_refund_001",
    stripeSubscriptionId: "sub_refund_001",
    ...input,
  };
}

function refundEvidence(
  repository: ReturnType<typeof createInMemoryAppDataRepository>,
) {
  const evidence = listEvidenceEventsForPatient(repository, {
    cognitoSub,
    limit: 100,
  });
  expect(evidence.ok).toBe(true);
  return evidence.ok
    ? evidence.value.items.filter((event) => event.eventType === "stripe_refund_status_changed")
    : [];
}
