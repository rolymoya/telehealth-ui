import { describe, expect, it } from "vitest";
import {
  createInMemoryAppDataRepository,
  createPatientProfileRecord,
  findPatientByStripePointer,
  getMdiLinkage,
  getStripeLinkage,
  linkMdiPatientCase,
  linkStripeCustomer,
  listStripeBillingReconciliationItems,
  mdiCaseStatusMirrorKey,
  recordCurrentMdiCaseStatusEvidence,
  recordEvidenceEvent,
  stripeBillingOpsReviewKey,
  type AppDataRepository,
  type MdiMirroredCaseStatus,
} from "@/lib/dynamodb/app-data";
import { caseStatusRank, isTerminalMdiCaseStatus } from "@/lib/mdi/case-status";
import {
  reconcileStripeMdiBilling,
  type StripeMdiBillingReconciliationGateway,
  type StripeMdiBillingReconciliationRepository,
} from "@/lib/billing-reconciliation";

const now = "2026-06-23T18:00:00.000Z";

describe("Stripe-MDI billing reconciliation", () => {
  it("accepts active Stripe billing when provider MDI status is billing_ready", async () => {
    const repository = seededRepository({
      billingStatus: "active",
      caseStatus: "billing_ready",
      cognitoSub: "cognito-sub-001",
      mdiCaseId: "mdi_case_recon_001",
      mdiPatientId: "mdi_patient_recon_001",
      stripeCustomerId: "cus_recon_001",
      stripeSubscriptionId: "sub_recon_001",
    });

    const result = await reconcileStripeMdiBilling({ limit: 10, now }, {
      gateway: gateway({
        mdiStatuses: {
          mdi_case_recon_001: { caseStatus: "billing_ready" },
        },
        stripeSubscriptions: {
          sub_recon_001: { status: "active", stripeCustomerId: "cus_recon_001" },
        },
      }),
      repository: reconciliationRepository(repository),
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        stats: {
          checked: 1,
          ok: 1,
          corrected: 0,
          opsReview: 0,
        },
      },
    });
    expect(listReconciliationEvidence(repository, "cognito-sub-001")).toHaveLength(0);
  });

  it("corrects stale local billing mirror when Stripe is already canceled", async () => {
    const repository = seededRepository({
      billingStatus: "active",
      caseStatus: "billing_ready",
      cognitoSub: "cognito-sub-002",
      mdiCaseId: "mdi_case_recon_002",
      mdiPatientId: "mdi_patient_recon_002",
      stripeCustomerId: "cus_recon_002",
      stripeSubscriptionId: "sub_recon_002",
    });

    const result = await reconcileStripeMdiBilling({ limit: 10, now }, {
      gateway: gateway({
        mdiStatuses: {
          mdi_case_recon_002: { caseStatus: "billing_ready" },
        },
        stripeSubscriptions: {
          sub_recon_002: { status: "canceled", stripeCustomerId: "cus_recon_002" },
        },
      }),
      repository: reconciliationRepository(repository),
    });

    expect(result).toMatchObject({
      ok: true,
      value: { stats: { checked: 1, corrected: 1, opsReview: 0 } },
    });
    expect(getStripeLinkage(repository, "cognito-sub-002")).toMatchObject({
      ok: true,
      value: {
        billingStatus: "canceled",
        stripeSubscriptionId: "sub_recon_002",
      },
    });
    expect(listStripeBillingReconciliationItems(repository)).toMatchObject({
      ok: true,
      value: { items: [] },
    });
  });

  it("routes active Stripe billing with terminal MDI provider status to ops review", async () => {
    const repository = seededRepository({
      billingStatus: "active",
      caseStatus: "billing_ready",
      cognitoSub: "cognito-sub-003",
      mdiCaseId: "mdi_case_recon_003",
      mdiPatientId: "mdi_patient_recon_003",
      stripeCustomerId: "cus_recon_003",
      stripeSubscriptionId: "sub_recon_003",
    });

    const result = await reconcileStripeMdiBilling({ limit: 10, now }, {
      gateway: gateway({
        mdiStatuses: {
          mdi_case_recon_003: { caseStatus: "declined" },
        },
        stripeSubscriptions: {
          sub_recon_003: { status: "active", stripeCustomerId: "cus_recon_003" },
        },
      }),
      repository: reconciliationRepository(repository),
    });

    expect(result).toMatchObject({
      ok: true,
      value: { stats: { checked: 1, corrected: 0, opsReview: 1 } },
    });
    expect(getStripeLinkage(repository, "cognito-sub-003")).toMatchObject({
      ok: true,
      value: { billingStatus: "active" },
    });
    expect(JSON.stringify(listEvidence(repository, "cognito-sub-003")))
      .not.toMatch(/QUESTION_TEXT|ANSWER_VALUE|semaglutide|diagnosis|workflow_url|token/i);
  });

  it("records an actionable ops item when Stripe metadata is not durable linkage", async () => {
    const repository = createInMemoryAppDataRepository();
    expect(repository.put(createPatientProfileRecord({
      cognitoSub: "cognito-sub-004",
      now,
      onboardingStatus: "billing_ready",
    })).ok).toBe(true);

    const result = await reconcileStripeMdiBilling({ limit: 10, now }, {
      gateway: gateway({
        discoveredSubscriptions: [{
          metadata: {
            apoth_stage: "staging",
            cognito_sub: "cognito-sub-004",
            mdi_case_id: "mdi_case_recon_004",
            mdi_patient_id: "mdi_patient_recon_004",
          },
          status: "active",
          stripeCustomerId: "cus_recon_004",
          stripeSubscriptionId: "sub_recon_004",
        }],
        mdiStatuses: {
          mdi_case_recon_004: { caseStatus: "billing_ready" },
        },
        stripeSubscriptions: {},
      }),
      repository: reconciliationRepository(repository),
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        stats: {
          checked: 1,
          opsReview: 1,
          skippedMissingLinkage: 1,
          stripeDiscovered: 1,
        },
      },
    });
    expect(listReconciliationEvidence(repository, "cognito-sub-004")).toHaveLength(0);
    expect(getOpsReview(repository, "sub_recon_004")).toMatchObject({
      recordType: "stripeBillingOpsReview",
      reasonCode: "unpaired_stripe_subscription",
      stripeCustomerId: "cus_recon_004",
      stripeSubscriptionId: "sub_recon_004",
    });
  });

  it("routes Stripe-discovered subscriptions with no resolvable patient linkage to durable ops review", async () => {
    const repository = createInMemoryAppDataRepository();

    const result = await reconcileStripeMdiBilling({ limit: 10, now }, {
      gateway: gateway({
        discoveredSubscriptions: [{
          metadata: { apoth_stage: "staging" },
          status: "active",
          stripeCustomerId: "cus_recon_099",
          stripeSubscriptionId: "sub_recon_099",
        }],
        stripeSubscriptions: {
          sub_recon_099: { status: "active", stripeCustomerId: "cus_recon_099" },
        },
      }),
      repository: reconciliationRepository(repository),
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        stats: {
          checked: 1,
          opsReview: 1,
          skippedMissingLinkage: 1,
          stripeDiscovered: 1,
        },
      },
    });
    expect(getOpsReview(repository, "sub_recon_099")).toMatchObject({
      recordType: "stripeBillingOpsReview",
      reasonCode: "unpaired_stripe_subscription",
      stripeCustomerId: "cus_recon_099",
    });
  });

  it("corrects past-due Stripe billing and raises ops review evidence", async () => {
    const repository = seededRepository({
      billingStatus: "active",
      caseStatus: "billing_ready",
      cognitoSub: "cognito-sub-007",
      mdiCaseId: "mdi_case_recon_007",
      mdiPatientId: "mdi_patient_recon_007",
      stripeCustomerId: "cus_recon_007",
      stripeSubscriptionId: "sub_recon_007",
    });

    const result = await reconcileStripeMdiBilling({ limit: 10, now }, {
      gateway: gateway({
        mdiStatuses: {
          mdi_case_recon_007: { caseStatus: "billing_ready" },
        },
        stripeSubscriptions: {
          sub_recon_007: { status: "past_due", stripeCustomerId: "cus_recon_007" },
        },
      }),
      repository: reconciliationRepository(repository),
    });

    expect(result).toMatchObject({
      ok: true,
      value: { stats: { checked: 1, corrected: 1, opsReview: 1 } },
    });
    expect(getStripeLinkage(repository, "cognito-sub-007")).toMatchObject({
      ok: true,
      value: { billingStatus: "past_due" },
    });
    expect(listReconciliationEvidence(repository, "cognito-sub-007")).toEqual([
      expect.objectContaining({
        metadata: {
          outcome: "ops_review_required",
          reason_code: "failed_payment_requires_review",
        },
        status: "recorded",
      }),
    ]);
  });

  it("keeps already past-due Stripe billing in ops review without duplicate evidence", async () => {
    const repository = seededRepository({
      billingStatus: "past_due",
      caseStatus: "billing_ready",
      cognitoSub: "cognito-sub-011",
      mdiCaseId: "mdi_case_recon_011",
      mdiPatientId: "mdi_patient_recon_011",
      stripeCustomerId: "cus_recon_011",
      stripeSubscriptionId: "sub_recon_011",
    });
    const deps = {
      gateway: gateway({
        mdiStatuses: {
          mdi_case_recon_011: { caseStatus: "billing_ready" },
        },
        stripeSubscriptions: {
          sub_recon_011: { status: "unpaid", stripeCustomerId: "cus_recon_011" },
        },
      }),
      repository: reconciliationRepository(repository),
    };

    await expect(reconcileStripeMdiBilling({ limit: 10, now }, deps))
      .resolves.toMatchObject({
        ok: true,
        value: { stats: { checked: 1, corrected: 0, opsReview: 1 } },
      });
    await expect(reconcileStripeMdiBilling({ limit: 10, now }, deps))
      .resolves.toMatchObject({
        ok: true,
        value: { stats: { checked: 1, corrected: 0, opsReview: 1 } },
      });
    expect(getStripeLinkage(repository, "cognito-sub-011")).toMatchObject({
      ok: true,
      value: { billingStatus: "past_due" },
    });
    expect(listReconciliationEvidence(repository, "cognito-sub-011")).toEqual([
      expect.objectContaining({
        metadata: {
          outcome: "ops_review_required",
          reason_code: "failed_payment_requires_review",
        },
        status: "recorded",
      }),
    ]);
  });

  it("ignores malformed Stripe metadata instead of failing the page", async () => {
    const repository = createInMemoryAppDataRepository();

    const result = await reconcileStripeMdiBilling({ limit: 10, now }, {
      gateway: gateway({
        discoveredSubscriptions: [{
          metadata: {
            apoth_stage: "staging",
            cognito_sub: "not a valid subject with spaces",
          },
          status: "active",
          stripeCustomerId: "cus_recon_008",
          stripeSubscriptionId: "sub_recon_008",
        }],
        stripeSubscriptions: {
          sub_recon_008: { status: "active", stripeCustomerId: "cus_recon_008" },
        },
      }),
      repository: reconciliationRepository(repository),
    });

    expect(result).toMatchObject({
      ok: true,
      value: { stats: { checked: 1, opsReview: 1, skippedMissingLinkage: 1 } },
    });
    expect(getOpsReview(repository, "sub_recon_008")).toMatchObject({
      recordType: "stripeBillingOpsReview",
      stripeCustomerId: "cus_recon_008",
    });
  });

  it("does not route evidence to a stale Stripe metadata subject", async () => {
    const repository = seededRepository({
      billingStatus: "active",
      caseStatus: "billing_ready",
      cognitoSub: "cognito-sub-009",
      mdiCaseId: "mdi_case_recon_009",
      mdiPatientId: "mdi_patient_recon_009",
      stripeCustomerId: "cus_recon_009",
      stripeSubscriptionId: "sub_recon_009",
    });

    const result = await reconcileStripeMdiBilling({ limit: 10, now }, {
      gateway: gateway({
        discoveredSubscriptions: [{
          metadata: {
            apoth_stage: "staging",
            cognito_sub: "cognito-sub-009",
          },
          status: "active",
          stripeCustomerId: "cus_recon_wrong_009",
          stripeSubscriptionId: "sub_recon_wrong_009",
        }],
        mdiStatuses: {
          mdi_case_recon_009: { caseStatus: "billing_ready" },
        },
        stripeSubscriptions: {
          sub_recon_009: { status: "active", stripeCustomerId: "cus_recon_009" },
          sub_recon_wrong_009: { status: "active", stripeCustomerId: "cus_recon_wrong_009" },
        },
      }),
      repository: reconciliationRepository(repository),
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        stats: {
          checked: 2,
          ok: 1,
          opsReview: 1,
          skippedMissingLinkage: 1,
        },
      },
    });
    expect(listReconciliationEvidence(repository, "cognito-sub-009")).toHaveLength(0);
    expect(getOpsReview(repository, "sub_recon_wrong_009")).toMatchObject({
      recordType: "stripeBillingOpsReview",
      stripeCustomerId: "cus_recon_wrong_009",
    });
  });

  it("classifies stale local MDI mirrors as ops review instead of ok", async () => {
    const repository = createInMemoryAppDataRepository();
    expect(repository.put(createPatientProfileRecord({
      cognitoSub: "cognito-sub-010",
      now,
      onboardingStatus: "billing_ready",
    })).ok).toBe(true);
    expect(linkMdiPatientCase(repository, {
      cognitoSub: "cognito-sub-010",
      mdiCaseId: "mdi_case_recon_010",
      mdiPatientId: "mdi_patient_recon_010",
      now,
    }).ok).toBe(true);
    expect(linkStripeCustomer(repository, {
      billingStatus: "active",
      cognitoSub: "cognito-sub-010",
      now,
      stripeBillingStatusObservedAt: now,
      stripeCustomerId: "cus_recon_010",
      stripeSubscriptionId: "sub_recon_010",
    }).ok).toBe(true);

    const result = await reconcileStripeMdiBilling({ limit: 10, now }, {
      gateway: gateway({
        mdiStatuses: {
          mdi_case_recon_010: { caseStatus: "billing_ready" },
        },
        stripeSubscriptions: {
          sub_recon_010: { status: "active", stripeCustomerId: "cus_recon_010" },
        },
      }),
      repository: reconciliationRepository(repository),
    });

    expect(result).toMatchObject({
      ok: true,
      value: { stats: { checked: 1, ok: 0, opsReview: 1 } },
    });
    expect(listReconciliationEvidence(repository, "cognito-sub-010")).toEqual([
      expect.objectContaining({
        metadata: {
          outcome: "ops_review_required",
          reason_code: "local_mirror_stale",
        },
      }),
    ]);
  });

  it("fails retryably without mutation when MDI is unavailable", async () => {
    const repository = seededRepository({
      billingStatus: "active",
      caseStatus: "billing_ready",
      cognitoSub: "cognito-sub-005",
      mdiCaseId: "mdi_case_recon_005",
      mdiPatientId: "mdi_patient_recon_005",
      stripeCustomerId: "cus_recon_005",
      stripeSubscriptionId: "sub_recon_005",
    });

    const result = await reconcileStripeMdiBilling({ limit: 10, now }, {
      gateway: gateway({
        mdiUnavailable: true,
        stripeSubscriptions: {
          sub_recon_005: { status: "active", stripeCustomerId: "cus_recon_005" },
        },
      }),
      repository: reconciliationRepository(repository),
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "provider_unavailable",
        retryable: true,
        stats: { checked: 1, providerUnavailable: 1 },
      },
    });
    expect(getStripeLinkage(repository, "cognito-sub-005")).toMatchObject({
      ok: true,
      value: { billingStatus: "active" },
    });
    expect(listReconciliationEvidence(repository, "cognito-sub-005")).toHaveLength(0);
  });

  it("replays deterministic per-item evidence without duplicating side effects", async () => {
    const repository = seededRepository({
      billingStatus: "active",
      caseStatus: "billing_ready",
      cognitoSub: "cognito-sub-006",
      mdiCaseId: "mdi_case_recon_006",
      mdiPatientId: "mdi_patient_recon_006",
      stripeCustomerId: "cus_recon_006",
      stripeSubscriptionId: "sub_recon_006",
    });
    const deps = {
      gateway: gateway({
        mdiStatuses: {
          mdi_case_recon_006: { caseStatus: "declined" },
        },
        stripeSubscriptions: {
          sub_recon_006: { status: "active", stripeCustomerId: "cus_recon_006" },
        },
      }),
      repository: reconciliationRepository(repository),
    };

    await expect(reconcileStripeMdiBilling({ limit: 10, now }, deps))
      .resolves.toMatchObject({ ok: true });
    await expect(reconcileStripeMdiBilling({ limit: 10, now }, deps))
      .resolves.toMatchObject({ ok: true });

    expect(listReconciliationEvidence(repository, "cognito-sub-006")).toHaveLength(1);
  });
});

function seededRepository(input: {
  billingStatus: "active" | "past_due" | "cancel_pending" | "canceled";
  caseStatus: MdiMirroredCaseStatus;
  cognitoSub: string;
  mdiCaseId: string;
  mdiPatientId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
}) {
  const repository = createInMemoryAppDataRepository();
  expect(repository.put(createPatientProfileRecord({
    cognitoSub: input.cognitoSub,
    now,
    onboardingStatus: "billing_ready",
  })).ok).toBe(true);
  expect(linkMdiPatientCase(repository, {
    cognitoSub: input.cognitoSub,
    mdiCaseId: input.mdiCaseId,
    mdiPatientId: input.mdiPatientId,
    now,
  }).ok).toBe(true);
  expect(recordCurrentMdiCaseStatusEvidence(repository, {
    actorType: "vendor",
    caseStatus: input.caseStatus,
    cognitoSub: input.cognitoSub,
    eventCategory: "webhook",
    eventId: `webhook:mdi:mdi_evt_${input.mdiCaseId}:WEBHOOK_SIDE_EFFECT_APPLIED:mdi_status_update`,
    eventType: "webhook_side_effect_applied",
    occurredAt: now,
    recordedAt: now,
    mdiCaseId: input.mdiCaseId,
    mdiPatientId: input.mdiPatientId,
    metadata: { side_effect: "mdi_status_update", case_status: input.caseStatus },
    source: "mdi",
    status: "succeeded",
    statusRank: caseStatusRank(input.caseStatus),
    summaryCode: "WEBHOOK_SIDE_EFFECT_APPLIED",
    terminal: isTerminalMdiCaseStatus(input.caseStatus),
    webhookEventId: `mdi_evt_${input.mdiCaseId}`,
    webhookProvider: "mdi",
  }).ok).toBe(true);
  expect(linkStripeCustomer(repository, {
    billingStatus: input.billingStatus,
    cognitoSub: input.cognitoSub,
    now,
    stripeBillingStatusObservedAt: now,
    stripeCustomerId: input.stripeCustomerId,
    stripeSubscriptionId: input.stripeSubscriptionId,
  }).ok).toBe(true);
  return repository;
}

function reconciliationRepository(repository: AppDataRepository): StripeMdiBillingReconciliationRepository {
  return {
    findPatientByStripePointer(pointer) {
      return Promise.resolve(findPatientByStripePointer(repository, pointer));
    },
    getMdiCaseStatusMirror(mdiCaseId) {
      const record = repository.get(mdiCaseStatusMirrorKey(mdiCaseId));
      if (!record.ok) {
        return Promise.resolve(record);
      }
      if (!record.value) {
        return Promise.resolve({ ok: true, value: null });
      }
      if (record.value.recordType !== "mdiCaseStatusMirror") {
        return Promise.resolve({
          ok: false,
          error: { kind: "validation_failed", message: "Wrong record type" },
        });
      }
      return Promise.resolve({ ok: true, value: record.value });
    },
    getMdiLinkage(cognitoSub) {
      return Promise.resolve(getMdiLinkage(repository, cognitoSub));
    },
    getStripeLinkage(cognitoSub) {
      return Promise.resolve(getStripeLinkage(repository, cognitoSub));
    },
    linkStripeCustomer(input) {
      return Promise.resolve(linkStripeCustomer(repository, input));
    },
    listStripeBillingReconciliationItems(input) {
      return Promise.resolve(listStripeBillingReconciliationItems(repository, input));
    },
    recordEvidenceEvent(input) {
      return Promise.resolve(recordEvidenceEvent(repository, input));
    },
    recordStripeBillingOpsReview(input) {
      const key = stripeBillingOpsReviewKey(input.stripeSubscriptionId);
      const existing = repository.get(key);
      if (!existing.ok) {
        return Promise.resolve(existing);
      }
      if (existing.value) {
        return existing.value.recordType === "stripeBillingOpsReview"
          ? Promise.resolve({ ok: true, value: existing.value })
          : Promise.resolve({
            ok: false,
            error: { kind: "validation_failed", message: "Wrong record type" },
          });
      }
      return Promise.resolve(repository.put({
        ...key,
        recordType: "stripeBillingOpsReview",
        schemaVersion: 1,
        createdAt: input.now,
        firstObservedAt: input.now,
        lastObservedAt: input.now,
        reasonCode: input.reason,
        stage: input.stage,
        status: "open",
        stripeCustomerId: input.stripeCustomerId,
        stripeSubscriptionId: input.stripeSubscriptionId,
        updatedAt: input.now,
      }, { ifNotExists: true }));
    },
  };
}

function gateway(input: {
  discoveredSubscriptions?: Array<{
    metadata?: Record<string, string>;
    status: string;
    stripeCustomerId: string;
    stripeSubscriptionId: string;
  }>;
  mdiStatuses?: Record<string, { caseStatus: MdiMirroredCaseStatus }>;
  mdiUnavailable?: boolean;
  stripeSubscriptions: Record<string, { status: string; stripeCustomerId: string }>;
}): StripeMdiBillingReconciliationGateway {
  return {
    async getMdiCaseStatus({ mdiCaseId }) {
      if (input.mdiUnavailable) {
        return {
          ok: false,
          error: {
            code: "provider_unavailable",
            message: "MDI unavailable",
            retryable: true,
          },
        };
      }
      const status = input.mdiStatuses?.[mdiCaseId];
      return status
        ? {
          ok: true,
          value: {
            caseStatus: status.caseStatus,
            mdiCaseId,
            providerTimestamp: now,
          },
        }
        : {
          ok: false,
          error: {
            code: "invalid_response",
            message: "Missing case",
            retryable: false,
          },
        };
    },
    async getStripeSubscription({ stripeSubscriptionId }) {
      const subscription = input.stripeSubscriptions[stripeSubscriptionId];
      return subscription
        ? {
          ok: true,
          value: {
            cancelAtPeriodEnd: false,
            currentPeriodEnd: "2026-07-23T18:00:00.000Z",
            currentPeriodStart: now,
            status: subscription.status,
            stripeCustomerId: subscription.stripeCustomerId,
            stripeSubscriptionId,
          },
        }
        : {
          ok: false,
          error: {
            code: "not_found",
            message: "Stripe subscription missing",
            retryable: false,
          },
        };
    },
    async listRecentStripeSubscriptions() {
      return {
        ok: true,
        value: {
          items: input.discoveredSubscriptions?.map((subscription) => ({
            cancelAtPeriodEnd: false,
            currentPeriodEnd: "2026-07-23T18:00:00.000Z",
            currentPeriodStart: now,
            metadata: subscription.metadata ?? {},
            status: subscription.status,
            stripeCustomerId: subscription.stripeCustomerId,
            stripeSubscriptionId: subscription.stripeSubscriptionId,
          })) ?? [],
        },
      };
    },
  };
}

function listEvidence(repository: AppDataRepository, cognitoSub: string) {
  const result = repository.queryByKeyPrefix({
    pk: `PATIENT#${cognitoSub}`,
    skPrefix: "EVIDENCE#",
  });
  expect(result.ok).toBe(true);
  return result.ok ? result.value.items : [];
}

function listReconciliationEvidence(repository: AppDataRepository, cognitoSub: string) {
  return listEvidence(repository, cognitoSub).filter((record) =>
    record.recordType === "evidenceEvent" &&
    record.eventType === "stripe_mdi_billing_reconciliation"
  );
}

function getOpsReview(repository: AppDataRepository, stripeSubscriptionId: string) {
  const result = repository.get(stripeBillingOpsReviewKey(stripeSubscriptionId));
  expect(result.ok).toBe(true);
  return result.ok ? result.value : null;
}
