import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createInMemoryAppDataRepository,
  createPatientProfileRecord,
  createWebhookEvidenceEventId,
  linkMdiPatientCase,
  listMdiCaseStatusReconciliationItems,
  mdiCaseStatusMirrorKey,
  operationalStatusKey,
  recordCurrentMdiCaseStatusEvidence,
  transitionOnboardingStatus,
  type AppDataRepository,
  type MdiMirroredCaseStatus,
} from "@/lib/dynamodb/app-data";
import {
  caseStatusRank,
  isTerminalMdiCaseStatus,
  type MdiCaseStatus,
} from "@/lib/mdi/case-status";
import type {
  MdiCaseStatusReconciliationGateway,
  MdiCaseStatusReconciliationRepository,
} from "@/lib/mdi-case-reconciliation";
import type { MdiCaseStatusReconciliationRuntimeRepository } from "../../../infra/src/lambda/mdi-case-reconciliation";

vi.mock("server-only", () => ({}));

const now = "2026-06-23T15:00:00.000Z";

describe("MDI case reconciliation Lambda", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.restoreAllMocks();
    process.env.APOTH_MDI_CASE_RECONCILIATION_LIMIT = "1";
    process.env.APOTH_STAGE = "staging";
    process.env.APP_TABLE_NAME = "apoth-staging-app";
    process.env.AWS_ACCESS_KEY_ID = "AKIATESTKEY";
    process.env.AWS_REGION = "us-east-1";
    process.env.AWS_SECRET_ACCESS_KEY = "test-secret-key";
    const { configureMdiCaseReconciliationLambdaForTests } = await import(
      "../../../infra/src/lambda/mdi-case-reconciliation"
    );
    configureMdiCaseReconciliationLambdaForTests({
      gateway: null,
      repository: null,
    });
  });

  it("corrects one bounded page, emits aggregate PHI-safe metrics, and saves the cursor", async () => {
    const repository = seededRuntimeRepository([
      {
        cognitoSub: "cognito-sub-001",
        caseStatus: "processing",
        eventId: "mdi_evt_case_processing_001",
        mdiCaseId: "mdi_case_reconcile_001",
        mdiPatientId: "mdi_patient_reconcile_001",
        providerTimestamp: "2026-06-23T14:00:00.000Z",
      },
      {
        cognitoSub: "cognito-sub-002",
        caseStatus: "processing",
        eventId: "mdi_evt_case_processing_002",
        mdiCaseId: "mdi_case_reconcile_002",
        mdiPatientId: "mdi_patient_reconcile_002",
        providerTimestamp: "2026-06-23T14:00:00.000Z",
      },
    ]);
    const gateway = gatewayWithStatuses({
      mdi_case_reconcile_001: {
        caseStatus: "billing_ready",
        mdiCaseId: "mdi_case_reconcile_001",
        providerTimestamp: "2026-06-23T14:30:00.000Z",
      },
      mdi_case_reconcile_002: {
        caseStatus: "billing_ready",
        mdiCaseId: "mdi_case_reconcile_002",
        providerTimestamp: "2026-06-23T14:30:00.000Z",
      },
    });
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { configureMdiCaseReconciliationLambdaForTests, handler } = await import(
      "../../../infra/src/lambda/mdi-case-reconciliation"
    );
    configureMdiCaseReconciliationLambdaForTests({ gateway, repository });

    await expect(
      handler(
        { id: "evt_scheduled_reconcile_001", time: now },
        { awsRequestId: "lambda_reconcile_001" },
      ),
    ).resolves.toEqual({
      ok: true,
      stats: {
        checked: 1,
        corrected: 1,
        invalidResponse: 0,
        providerUnavailable: 0,
        skippedCurrent: 0,
        skippedStale: 0,
      },
    });

    expect(repository.get(mdiCaseStatusMirrorKey("mdi_case_reconcile_001"))).toMatchObject({
      ok: true,
      value: {
        caseStatus: "billing_ready",
        providerTimestamp: "2026-06-23T14:30:00.000Z",
      },
    });
    expect(repository.get(mdiCaseStatusMirrorKey("mdi_case_reconcile_002"))).toMatchObject({
      ok: true,
      value: {
        caseStatus: "processing",
      },
    });
    expect(repository.get(operationalStatusKey("mdi-case-reconciliation"))).toMatchObject({
      ok: true,
      value: {
        jobName: "mdi-case-reconciliation",
        lastCursorPk: "MDI#CASE_STATUS_RECONCILIATION#ACTIVE",
        lastCursorSk: "CASE#mdi_case_reconcile_001",
        lastRequestId: "lambda_reconcile_001",
        lastScheduledAt: now,
        status: "ok",
      },
    });

    const logs = JSON.stringify([...info.mock.calls, ...warn.mock.calls]);
    expect(logs).toContain("mdi_case_reconciliation_metrics");
    expect(logs).toContain("MdiCaseReconciliationCorrections");
    expect(logs).not.toMatch(/cognito-sub|mdi_patient|QUESTION_TEXT|ANSWER_VALUE|workflow_url|token/i);
    expect(warn).not.toHaveBeenCalled();
  });

  it("throws on MDI 418/provider unavailable without mutating the local mirror", async () => {
    const repository = seededRuntimeRepository([
      {
        cognitoSub: "cognito-sub-003",
        caseStatus: "processing",
        eventId: "mdi_evt_case_processing_003",
        mdiCaseId: "mdi_case_reconcile_003",
        mdiPatientId: "mdi_patient_reconcile_003",
        providerTimestamp: "2026-06-23T14:00:00.000Z",
      },
    ]);
    const gateway: MdiCaseStatusReconciliationGateway = {
      async getCaseStatus() {
        return {
          ok: false,
          error: {
            code: "provider_unavailable",
            message: "MDI maintenance",
            retryable: true,
            status: 418,
          },
        };
      },
    };
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { configureMdiCaseReconciliationLambdaForTests, handler } = await import(
      "../../../infra/src/lambda/mdi-case-reconciliation"
    );
    configureMdiCaseReconciliationLambdaForTests({ gateway, repository });

    await expect(
      handler(
        { id: "evt_scheduled_reconcile_002", time: now },
        { awsRequestId: "lambda_reconcile_002" },
      ),
    ).rejects.toThrow("MDI case status reconciliation could not read all provider statuses");

    expect(repository.get(mdiCaseStatusMirrorKey("mdi_case_reconcile_003"))).toMatchObject({
      ok: true,
      value: {
        caseStatus: "processing",
        providerTimestamp: "2026-06-23T14:00:00.000Z",
      },
    });
    expect(repository.get(operationalStatusKey("mdi-case-reconciliation"))).toEqual({
      ok: true,
      value: null,
    });
    const logs = JSON.stringify([...info.mock.calls, ...warn.mock.calls]);
    expect(logs).toContain("mdi_case_reconciliation_failed");
    expect(logs).toContain("providerUnavailable");
    expect(logs).not.toMatch(/cognito-sub|mdi_patient|mdi_case_reconcile_003|QUESTION_TEXT|ANSWER_VALUE|workflow_url|token/i);
  });
});

function seededRuntimeRepository(
  cases: Array<{
    cognitoSub: string;
    caseStatus: MdiCaseStatus;
    eventId: string;
    mdiCaseId: string;
    mdiPatientId: string;
    providerTimestamp: string;
  }>,
): MdiCaseStatusReconciliationRuntimeRepository {
  const repository = createInMemoryAppDataRepository();
  for (const item of cases) {
    expect(repository.put(createPatientProfileRecord({
      cognitoSub: item.cognitoSub,
      onboardingStatus: "mdi_submitted",
      now,
    })).ok).toBe(true);
    expect(linkMdiPatientCase(repository, {
      cognitoSub: item.cognitoSub,
      mdiCaseId: item.mdiCaseId,
      mdiPatientId: item.mdiPatientId,
      now,
    }).ok).toBe(true);
    seedCaseStatus(repository, item);
  }
  return runtimeRepository(repository);
}

function runtimeRepository(
  repository: AppDataRepository,
): MdiCaseStatusReconciliationRuntimeRepository {
  return {
    get(key) {
      return repository.get(key);
    },
    async listCaseStatusReconciliationItems(input) {
      return listMdiCaseStatusReconciliationItems(repository, input);
    },
    put(record, options) {
      return repository.put(record, options);
    },
    async recordCurrentCaseStatusEvidence(
      input: Parameters<MdiCaseStatusReconciliationRepository["recordCurrentCaseStatusEvidence"]>[0],
    ) {
      return recordCurrentMdiCaseStatusEvidence(repository, input);
    },
    async transitionOnboardingStatus(input) {
      return transitionOnboardingStatus(repository, input);
    },
    update(record, options) {
      return repository.update(record, options);
    },
  };
}

function seedCaseStatus(
  repository: AppDataRepository,
  input: {
    cognitoSub: string;
    caseStatus: MdiCaseStatus;
    eventId: string;
    mdiCaseId: string;
    mdiPatientId: string;
    providerTimestamp: string;
  },
) {
  expect(recordCurrentMdiCaseStatusEvidence(repository, {
    actorType: "vendor",
    caseStatus: input.caseStatus as MdiMirroredCaseStatus,
    cognitoSub: input.cognitoSub,
    eventCategory: "webhook",
    eventId: createWebhookEvidenceEventId(
      "mdi",
      input.eventId,
      "WEBHOOK_SIDE_EFFECT_APPLIED",
      "mdi_status_update",
    ),
    eventType: "webhook_side_effect_applied",
    occurredAt: input.providerTimestamp,
    recordedAt: input.providerTimestamp,
    mdiCaseId: input.mdiCaseId,
    mdiPatientId: input.mdiPatientId,
    metadata: { side_effect: "mdi_status_update", case_status: input.caseStatus },
    source: "webhook",
    status: "succeeded",
    statusRank: caseStatusRank(input.caseStatus),
    summaryCode: "WEBHOOK_SIDE_EFFECT_APPLIED",
    terminal: isTerminalMdiCaseStatus(input.caseStatus),
    webhookEventId: input.eventId,
    webhookProvider: "mdi",
  })).toMatchObject({ ok: true, value: { applied: true } });
}

function gatewayWithStatuses(
  statuses: Record<string, {
    caseStatus: MdiCaseStatus;
    mdiCaseId: string;
    providerTimestamp: string;
  }>,
): MdiCaseStatusReconciliationGateway {
  return {
    async getCaseStatus(input) {
      const status = statuses[input.mdiCaseId];
      if (!status) {
        return {
          ok: false,
          error: {
            code: "provider_unavailable",
            message: "Missing test status",
            retryable: true,
            status: 503,
          },
        };
      }
      return { ok: true, value: status };
    },
  };
}
