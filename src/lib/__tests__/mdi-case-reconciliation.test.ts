import { describe, expect, it } from "vitest";
import {
  createInMemoryAppDataRepository,
  createPatientProfileRecord,
  createWebhookEvidenceEventId,
  linkMdiPatientCase,
  listMdiCaseStatusReconciliationItems,
  mdiCaseStatusReconciliationIndexKey,
  mdiCaseStatusMirrorKey,
  recordCurrentMdiCaseStatusEvidence,
  transitionOnboardingStatus,
  type AppDataRepository,
  type MdiMirroredCaseStatus,
} from "@/lib/dynamodb/app-data";
import {
  reconcileMdiCaseStatuses,
  type MdiCaseStatusReconciliationGateway,
} from "@/lib/mdi-case-reconciliation";
import {
  caseStatusRank,
  isTerminalMdiCaseStatus,
  type MdiCaseStatus,
} from "@/lib/mdi/case-status";

const cognitoSub = "cognito-sub-001";
const mdiPatientId = "mdi_patient_001";
const mdiCaseId = "mdi_case_001";
const now = "2026-06-20T16:00:00.000Z";

describe("MDI case-status reconciliation", () => {
  it("corrects a stale local case-status mirror without storing PHI-heavy payload content", async () => {
    const repository = seededRepository();
    seedCaseStatus(repository, {
      caseStatus: "processing",
      eventId: "mdi_evt_case_processing_001",
      providerTimestamp: "2026-06-20T15:00:00.000Z",
    });

    const gateway: MdiCaseStatusReconciliationGateway = {
      async getCaseStatus() {
        return {
          ok: true,
          value: {
            caseStatus: "billing_ready",
            mdiCaseId,
            providerTimestamp: "2026-06-20T15:30:00.000Z",
          },
        };
      },
    };

    await expect(
      reconcileMdiCaseStatuses({ now }, {
        gateway,
        repository: reconciliationRepository(repository),
      }),
    ).resolves.toEqual({
      ok: true,
      value: {
        nextKey: undefined,
        stats: {
          checked: 1,
          corrected: 1,
          invalidResponse: 0,
          providerUnavailable: 0,
          skippedCurrent: 0,
          skippedStale: 0,
        },
      },
    });

    expect(repository.get(mdiCaseStatusMirrorKey(mdiCaseId))).toMatchObject({
      ok: true,
      value: {
        caseStatus: "billing_ready",
        providerTimestamp: "2026-06-20T15:30:00.000Z",
        terminal: false,
      },
    });
    expect(repository.get(mdiCaseStatusReconciliationIndexKey(mdiCaseId))).toMatchObject({
      ok: true,
      value: {
        caseStatus: "billing_ready",
        providerTimestamp: "2026-06-20T15:30:00.000Z",
        terminal: false,
      },
    });
    expect(JSON.stringify(repository.get(mdiCaseStatusMirrorKey(mdiCaseId))))
      .not.toMatch(/TRANSIENT_NAME_SENTINEL|TRANSIENT_MEDICATION_SENTINEL/);
  });

  it("does not mutate local status when MDI is unavailable", async () => {
    const repository = seededRepository();
    seedCaseStatus(repository, {
      caseStatus: "processing",
      eventId: "mdi_evt_case_processing_001",
      providerTimestamp: "2026-06-20T15:00:00.000Z",
    });

    await expect(
      reconcileMdiCaseStatuses({ now }, {
        gateway: {
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
        },
        repository: reconciliationRepository(repository),
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "provider_unavailable",
        retryable: true,
        stats: {
          checked: 1,
          corrected: 0,
          providerUnavailable: 1,
        },
      },
    });
    expect(repository.get(mdiCaseStatusMirrorKey(mdiCaseId))).toMatchObject({
      ok: true,
      value: {
        caseStatus: "processing",
        providerTimestamp: "2026-06-20T15:00:00.000Z",
      },
    });
  });

  it("fails closed and non-retryable on invalid provider case-status data", async () => {
    const repository = seededRepository();
    seedCaseStatus(repository, {
      caseStatus: "processing",
      eventId: "mdi_evt_case_processing_001",
      providerTimestamp: "2026-06-20T15:00:00.000Z",
    });

    await expect(
      reconcileMdiCaseStatuses({ now }, {
        gateway: {
          async getCaseStatus() {
            return {
              ok: false,
              error: {
                code: "invalid_response",
                message: "Unexpected MDI status payload",
                retryable: false,
              },
            };
          },
        },
        repository: reconciliationRepository(repository),
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "invalid_response",
        retryable: false,
        stats: {
          corrected: 0,
          invalidResponse: 1,
          providerUnavailable: 0,
        },
      },
    });
    expect(repository.get(mdiCaseStatusMirrorKey(mdiCaseId))).toMatchObject({
      ok: true,
      value: {
        caseStatus: "processing",
        providerTimestamp: "2026-06-20T15:00:00.000Z",
      },
    });
  });

  it("retries onboarding transition when status evidence already reflects the provider snapshot", async () => {
    const repository = seededRepository();
    seedCaseStatus(repository, {
      caseStatus: "billing_ready",
      eventId: "mdi_evt_case_clinically_approved_001",
      providerTimestamp: "2026-06-20T15:30:00.000Z",
    });

    await expect(
      reconcileMdiCaseStatuses({ now }, {
        gateway: {
          async getCaseStatus() {
            return {
              ok: true,
              value: {
                caseStatus: "billing_ready",
                mdiCaseId,
                providerTimestamp: "2026-06-20T15:30:00.000Z",
              },
            };
          },
        },
        repository: reconciliationRepository(repository),
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        stats: {
          corrected: 0,
          skippedCurrent: 1,
        },
      },
    });
    expect(repository.get({ pk: `PATIENT#${cognitoSub}`, sk: "PROFILE" })).toMatchObject({
      ok: true,
      value: { onboardingStatus: "billing_ready" },
    });
  });
});

function seededRepository() {
  const repository = createInMemoryAppDataRepository();
  const profile = createPatientProfileRecord({
    cognitoSub,
    onboardingStatus: "mdi_submitted",
    now,
  });
  expect(repository.put(profile).ok).toBe(true);
  expect(linkMdiPatientCase(repository, {
    cognitoSub,
    mdiCaseId,
    mdiPatientId,
    now,
  }).ok).toBe(true);
  return repository;
}

function seedCaseStatus(
  repository: AppDataRepository,
  input: {
    caseStatus: MdiCaseStatus;
    eventId: string;
    providerTimestamp: string;
  },
) {
  const result = recordCurrentMdiCaseStatusEvidence(repository, {
    actorType: "vendor",
    caseStatus: input.caseStatus as MdiMirroredCaseStatus,
    cognitoSub,
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
    mdiCaseId,
    mdiPatientId,
    metadata: { side_effect: "mdi_status_update", case_status: input.caseStatus },
    source: "webhook",
    status: "succeeded",
    statusRank: caseStatusRank(input.caseStatus),
    summaryCode: "WEBHOOK_SIDE_EFFECT_APPLIED",
    terminal: isTerminalMdiCaseStatus(input.caseStatus),
    webhookEventId: input.eventId,
    webhookProvider: "mdi",
  });
  expect(result).toMatchObject({ ok: true, value: { applied: true } });
}

function reconciliationRepository(repository: AppDataRepository) {
  return {
    async listCaseStatusReconciliationItems(input: {
      includeTerminal?: boolean;
      limit?: number;
    }) {
      return listMdiCaseStatusReconciliationItems(repository, input);
    },
    async recordCurrentCaseStatusEvidence(
      input: Parameters<typeof recordCurrentMdiCaseStatusEvidence>[1],
    ) {
      return recordCurrentMdiCaseStatusEvidence(repository, input);
    },
    async transitionOnboardingStatus(input: Parameters<typeof transitionOnboardingStatus>[1]) {
      return transitionOnboardingStatus(repository, input);
    },
  };
}
