import { beforeEach, describe, expect, it, vi } from "vitest";
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
  operationalStatusKey,
  recordCurrentMdiCaseStatusEvidence,
  recordEvidenceEvent,
  stripeBillingOpsReviewKey,
  type AppDataRepository,
  type AppDataKey,
  type MdiMirroredCaseStatus,
} from "@/lib/dynamodb/app-data";
import { caseStatusRank, isTerminalMdiCaseStatus } from "@/lib/mdi/case-status";
import type {
  StripeMdiBillingReconciliationGateway,
  StripeMdiBillingReconciliationRepository,
} from "@/lib/billing-reconciliation";
import type { StripeMdiBillingReconciliationRuntimeRepository } from "../../../infra/src/lambda/stripe-mdi-billing-reconciliation";

vi.mock("server-only", () => ({}));

const now = "2026-06-23T19:00:00.000Z";

describe("Stripe-MDI billing reconciliation Lambda", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.restoreAllMocks();
    process.env.APOTH_STAGE = "staging";
    process.env.APOTH_STRIPE_MDI_BILLING_RECONCILIATION_LIMIT = "1";
    process.env.APP_TABLE_NAME = "apoth-staging-app";
    process.env.AWS_ACCESS_KEY_ID = "AKIATESTKEY";
    process.env.AWS_REGION = "us-east-1";
    process.env.AWS_SECRET_ACCESS_KEY = "test-secret-key";
    const { configureStripeMdiBillingReconciliationLambdaForTests } = await import(
      "../../../infra/src/lambda/stripe-mdi-billing-reconciliation"
    );
    configureStripeMdiBillingReconciliationLambdaForTests({
      gateway: null,
      repository: null,
    });
  });

  it("checks one bounded page, emits aggregate PHI-safe metrics, and saves cursors", async () => {
    const repository = seededRuntimeRepository([
      {
        billingStatus: "active",
        caseStatus: "billing_ready",
        cognitoSub: "cognito-sub-101",
        mdiCaseId: "mdi_case_billing_reconcile_101",
        mdiPatientId: "mdi_patient_billing_reconcile_101",
        stripeCustomerId: "cus_billing_reconcile_101",
        stripeSubscriptionId: "sub_billing_reconcile_101",
      },
      {
        billingStatus: "active",
        caseStatus: "billing_ready",
        cognitoSub: "cognito-sub-102",
        mdiCaseId: "mdi_case_billing_reconcile_102",
        mdiPatientId: "mdi_patient_billing_reconcile_102",
        stripeCustomerId: "cus_billing_reconcile_102",
        stripeSubscriptionId: "sub_billing_reconcile_102",
      },
    ]);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { configureStripeMdiBillingReconciliationLambdaForTests, handler } = await import(
      "../../../infra/src/lambda/stripe-mdi-billing-reconciliation"
    );
    configureStripeMdiBillingReconciliationLambdaForTests({
      gateway: gateway({
        nextStripeCursor: "page_opaque_next",
        mdiStatuses: {
          mdi_case_billing_reconcile_101: { caseStatus: "billing_ready" },
          mdi_case_billing_reconcile_102: { caseStatus: "billing_ready" },
        },
        stripeSubscriptions: {
          sub_billing_reconcile_101: {
            status: "active",
            stripeCustomerId: "cus_billing_reconcile_101",
          },
          sub_billing_reconcile_102: {
            status: "active",
            stripeCustomerId: "cus_billing_reconcile_102",
          },
        },
      }),
      repository,
    });

    await expect(
      handler(
        { id: "evt_scheduled_billing_reconcile_001", time: now },
        { awsRequestId: "lambda_billing_reconcile_001" },
      ),
    ).resolves.toEqual({
      ok: true,
      stats: {
        checked: 1,
        corrected: 0,
        ok: 1,
        opsReview: 0,
        providerUnavailable: 0,
        skippedMissingLinkage: 0,
        storageFailures: 0,
        stripeDiscovered: 0,
      },
    });

    expect(repository.get(operationalStatusKey("stripe-mdi-billing-reconciliation"))).toMatchObject({
      ok: true,
      value: {
        jobName: "stripe-mdi-billing-reconciliation",
        lastCursorPk: "STRIPE#BILLING_RECONCILIATION#ACTIVE",
        lastCursorSk: "SUBSCRIPTION#sub_billing_reconcile_101",
        lastProviderCursor: "page_opaque_next",
        lastRequestId: "lambda_billing_reconcile_001",
        lastScheduledAt: now,
        status: "ok",
      },
    });
    const logs = JSON.stringify([...info.mock.calls, ...warn.mock.calls]);
    expect(logs).toContain("stripe_mdi_billing_reconciliation_metrics");
    expect(logs).toContain("StripeMdiBillingReconciliationCorrections");
    expect(logs).not.toMatch(/cognito-sub|mdi_patient|mdi_case|cus_|sub_|QUESTION_TEXT|ANSWER_VALUE|workflow_url|token/i);
    expect(warn).not.toHaveBeenCalled();
  });

  it("loads Stripe provider cursor even when the local cursor is empty", async () => {
    const repository = seededRuntimeRepository([]);
    await expect(Promise.resolve(repository.put({
      ...operationalStatusKey("stripe-mdi-billing-reconciliation"),
      recordType: "operationalStatus",
      schemaVersion: 1,
      createdAt: now,
      jobName: "stripe-mdi-billing-reconciliation",
      lastHeartbeatAt: now,
      lastProviderCursor: "page_two",
      lastRequestId: "lambda_previous",
      lastScheduledAt: now,
      name: "stripe-mdi-billing-reconciliation",
      stage: "staging",
      status: "ok",
      updatedAt: now,
    }, { ifNotExists: true }))).resolves.toMatchObject({ ok: true });
    const observedStripeCursors: Array<string | undefined> = [];
    const { configureStripeMdiBillingReconciliationLambdaForTests, handler } = await import(
      "../../../infra/src/lambda/stripe-mdi-billing-reconciliation"
    );
    configureStripeMdiBillingReconciliationLambdaForTests({
      gateway: gateway({
        nextStripeCursor: "page_three",
        observedStripeCursors,
        stripeSubscriptions: {},
      }),
      repository,
    });

    await expect(
      handler(
        { id: "evt_scheduled_billing_reconcile_cursor", time: now },
        { awsRequestId: "lambda_billing_reconcile_cursor" },
      ),
    ).resolves.toMatchObject({
      ok: true,
      stats: { checked: 0 },
    });

    expect(observedStripeCursors).toEqual(["page_two"]);
    expect(repository.get(operationalStatusKey("stripe-mdi-billing-reconciliation"))).toMatchObject({
      ok: true,
      value: {
        lastProviderCursor: "page_three",
        lastRequestId: "lambda_billing_reconcile_cursor",
      },
    });
  });

  it("throws on MDI unavailable without mutating billing or saving cursor", async () => {
    const repository = seededRuntimeRepository([
      {
        billingStatus: "active",
        caseStatus: "billing_ready",
        cognitoSub: "cognito-sub-103",
        mdiCaseId: "mdi_case_billing_reconcile_103",
        mdiPatientId: "mdi_patient_billing_reconcile_103",
        stripeCustomerId: "cus_billing_reconcile_103",
        stripeSubscriptionId: "sub_billing_reconcile_103",
      },
    ]);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { configureStripeMdiBillingReconciliationLambdaForTests, handler } = await import(
      "../../../infra/src/lambda/stripe-mdi-billing-reconciliation"
    );
    configureStripeMdiBillingReconciliationLambdaForTests({
      gateway: gateway({
        mdiUnavailable: true,
        stripeSubscriptions: {
          sub_billing_reconcile_103: {
            status: "active",
            stripeCustomerId: "cus_billing_reconcile_103",
          },
        },
      }),
      repository,
    });

    await expect(
      handler(
        { id: "evt_scheduled_billing_reconcile_002", time: now },
        { awsRequestId: "lambda_billing_reconcile_002" },
      ),
    ).rejects.toThrow("MDI unavailable");

    await expect(repository.getStripeLinkage("cognito-sub-103")).resolves.toMatchObject({
      ok: true,
      value: { billingStatus: "active" },
    });
    expect(repository.get(operationalStatusKey("stripe-mdi-billing-reconciliation"))).toEqual({
      ok: true,
      value: null,
    });
    const logs = JSON.stringify([...info.mock.calls, ...warn.mock.calls]);
    expect(logs).toContain("stripe_mdi_billing_reconciliation_failed");
    expect(logs).toContain("providerUnavailable");
    expect(logs).not.toMatch(/cognito-sub|mdi_patient|mdi_case|cus_|sub_|QUESTION_TEXT|ANSWER_VALUE|workflow_url|token/i);
  });
});

function seededRuntimeRepository(
  inputs: Array<{
    billingStatus: "active" | "past_due" | "cancel_pending" | "canceled";
    caseStatus: MdiMirroredCaseStatus;
    cognitoSub: string;
    mdiCaseId: string;
    mdiPatientId: string;
    stripeCustomerId: string;
    stripeSubscriptionId: string;
  }>,
): StripeMdiBillingReconciliationRuntimeRepository {
  const repository = createInMemoryAppDataRepository();
  for (const input of inputs) {
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
  }
  return runtimeRepository(repository);
}

function runtimeRepository(
  repository: AppDataRepository,
): StripeMdiBillingReconciliationRuntimeRepository {
  return {
    findPatientByStripePointer(pointer) {
      return Promise.resolve(findPatientByStripePointer(repository, pointer));
    },
    get(key: AppDataKey) {
      return repository.get(key);
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
    put(record, options) {
      return repository.put(record, options);
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
    update(record, options) {
      return repository.update(record, options);
    },
  };
}

function gateway(input: {
  mdiStatuses?: Record<string, { caseStatus: MdiMirroredCaseStatus }>;
  mdiUnavailable?: boolean;
  nextStripeCursor?: string;
  observedStripeCursors?: Array<string | undefined>;
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
            status: 418,
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
            currentPeriodEnd: "2026-07-23T19:00:00.000Z",
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
    async listRecentStripeSubscriptions(listInput) {
      input.observedStripeCursors?.push(listInput.cursor);
      return {
        ok: true,
        value: {
          items: [],
          nextCursor: input.nextStripeCursor,
        },
      };
    },
  };
}
