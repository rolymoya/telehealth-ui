import "server-only";

import { createHash } from "node:crypto";
import {
  type AppDataError,
  type AppDataKey,
  type AppDataResult,
  type EvidenceEventRecord,
  type MdiCaseStatusReconciliationIndexRecord,
  type OnboardingStatus,
  createWebhookEvidenceEventId,
} from "@/lib/dynamodb/app-data";
import {
  caseStatusRank,
  isTerminalMdiCaseStatus,
  onboardingTargetForMdiCaseStatus,
  type MdiCaseStatus,
} from "@/lib/mdi/case-status";

export type MdiCaseStatusSnapshot = {
  mdiCaseId: string;
  caseStatus: MdiCaseStatus;
  providerTimestamp: string;
};

export type MdiCaseStatusReconciliationErrorCode =
  | "invalid_response"
  | "provider_unavailable"
  | "storage_failure";

export type MdiCaseStatusReconciliationGateway = {
  getCaseStatus(input: {
    mdiCaseId: string;
  }): Promise<
    | { ok: true; value: MdiCaseStatusSnapshot }
    | {
        ok: false;
        error: {
          code: "invalid_response" | "provider_unavailable";
          message: string;
          retryable: boolean;
          status?: number;
        };
      }
  >;
};

export type MdiCaseStatusReconciliationRepository = {
  listCaseStatusReconciliationItems(input: {
    exclusiveStartKey?: AppDataKey;
    includeTerminal?: boolean;
    limit?: number;
  }): Promise<AppDataResult<{
    items: MdiCaseStatusReconciliationIndexRecord[];
    nextKey?: AppDataKey;
  }>>;
  recordCurrentCaseStatusEvidence(
    input: Parameters<typeof import("@/lib/dynamodb/app-data").recordCurrentMdiCaseStatusEvidence>[1],
  ): Promise<AppDataResult<{ applied: boolean; record: EvidenceEventRecord }>>;
  transitionOnboardingStatus(input: {
    cognitoSub: string;
    expected: OnboardingStatus;
    next: OnboardingStatus;
    now: string;
  }): Promise<AppDataResult<unknown>>;
};

export type MdiCaseStatusReconciliationStats = {
  checked: number;
  corrected: number;
  providerUnavailable: number;
  invalidResponse: number;
  skippedCurrent: number;
  skippedStale: number;
};

export type MdiCaseStatusReconciliationResult =
  | { ok: true; value: { nextKey?: AppDataKey; stats: MdiCaseStatusReconciliationStats } }
  | {
      ok: false;
      error: {
        code: MdiCaseStatusReconciliationErrorCode;
        message: string;
        retryable: boolean;
        stats: MdiCaseStatusReconciliationStats;
      };
    };

export async function reconcileMdiCaseStatuses(
  input: {
    exclusiveStartKey?: AppDataKey;
    limit?: number;
    now: string;
  },
  deps: {
    gateway: MdiCaseStatusReconciliationGateway;
    repository: MdiCaseStatusReconciliationRepository;
  },
): Promise<MdiCaseStatusReconciliationResult> {
  const stats: MdiCaseStatusReconciliationStats = {
    checked: 0,
    corrected: 0,
    invalidResponse: 0,
    providerUnavailable: 0,
    skippedCurrent: 0,
    skippedStale: 0,
  };

  const listed = await deps.repository.listCaseStatusReconciliationItems({
    exclusiveStartKey: input.exclusiveStartKey,
    includeTerminal: false,
    limit: input.limit,
  });
  if (!listed.ok) {
    return storageFailure(listed.error, stats);
  }

  for (const item of listed.value.items) {
    stats.checked += 1;
    const provider = await deps.gateway.getCaseStatus({ mdiCaseId: item.mdiCaseId });
    if (!provider.ok) {
      if (provider.error.code === "invalid_response") {
        stats.invalidResponse += 1;
      } else {
        stats.providerUnavailable += 1;
      }
      continue;
    }

    const snapshot = provider.value;
    if (snapshot.mdiCaseId !== item.mdiCaseId) {
      stats.invalidResponse += 1;
      continue;
    }
    if (!isIncomingCurrent(item, snapshot)) {
      stats.skippedCurrent += 1;
      const reconciled = await applyOnboardingTargetForStatus(deps.repository, {
        cognitoSub: item.cognitoSub,
        now: input.now,
        status: item.caseStatus,
      });
      if (!reconciled.ok) {
        return onboardingFailure(reconciled.retryable, stats);
      }
      continue;
    }

    const syntheticEventId = reconciliationEventId(snapshot);
    const evidence = await deps.repository.recordCurrentCaseStatusEvidence({
      actorType: "vendor",
      caseStatus: snapshot.caseStatus,
      cognitoSub: item.cognitoSub,
      eventCategory: "webhook",
      eventId: createWebhookEvidenceEventId(
        "mdi",
        syntheticEventId,
        "WEBHOOK_SIDE_EFFECT_APPLIED",
        "mdi_status_update",
      ),
      eventType: "webhook_side_effect_applied",
      occurredAt: snapshot.providerTimestamp,
      recordedAt: input.now,
      mdiCaseId: snapshot.mdiCaseId,
      mdiPatientId: item.mdiPatientId,
      metadata: { side_effect: "mdi_status_update", case_status: snapshot.caseStatus },
      source: "mdi",
      status: "succeeded",
      statusRank: caseStatusRank(snapshot.caseStatus),
      summaryCode: "WEBHOOK_SIDE_EFFECT_APPLIED",
      terminal: isTerminalMdiCaseStatus(snapshot.caseStatus),
      webhookEventId: syntheticEventId,
      webhookProvider: "mdi",
    });
    if (!evidence.ok) {
      if (evidence.error.kind === "stale_transition") {
        stats.skippedStale += 1;
        continue;
      }
      return storageFailure(evidence.error, stats);
    }
    if (evidence.value.applied) {
      stats.corrected += 1;
    }

    const target = onboardingTargetForMdiCaseStatus(snapshot.caseStatus);
    if (target) {
      const transitioned = await applyOnboardingMirror(deps.repository, {
        cognitoSub: item.cognitoSub,
        next: target,
        now: input.now,
      });
      if (!transitioned.ok) {
        return onboardingFailure(transitioned.retryable, stats);
      }
    }
  }

  if (stats.invalidResponse > 0) {
    return {
      ok: false,
      error: {
        code: "invalid_response",
        message: "MDI case status reconciliation received invalid provider data",
        retryable: false,
        stats,
      },
    };
  }

  if (stats.providerUnavailable > 0) {
    return {
      ok: false,
      error: {
        code: "provider_unavailable",
        message: "MDI case status reconciliation could not read all provider statuses",
        retryable: true,
        stats,
      },
    };
  }

  return { ok: true, value: { nextKey: listed.value.nextKey, stats } };
}

async function applyOnboardingTargetForStatus(
  repository: Pick<MdiCaseStatusReconciliationRepository, "transitionOnboardingStatus">,
  input: { cognitoSub: string; now: string; status: MdiCaseStatus },
) {
  const target = onboardingTargetForMdiCaseStatus(input.status);
  if (!target) {
    return { ok: true as const };
  }
  return applyOnboardingMirror(repository, {
    cognitoSub: input.cognitoSub,
    next: target,
    now: input.now,
  });
}

function isIncomingCurrent(
  current: MdiCaseStatusReconciliationIndexRecord,
  incoming: MdiCaseStatusSnapshot,
) {
  const incomingTime = Date.parse(incoming.providerTimestamp);
  const currentTime = Date.parse(current.providerTimestamp);
  if (!Number.isFinite(incomingTime) || !Number.isFinite(currentTime)) {
    return false;
  }
  if (incomingTime < currentTime) {
    return false;
  }
  const incomingTerminal = isTerminalMdiCaseStatus(incoming.caseStatus);
  if (current.terminal && !incomingTerminal) {
    return false;
  }
  const incomingRank = caseStatusRank(incoming.caseStatus);
  if (incomingTime === currentTime && incomingRank <= current.statusRank) {
    return false;
  }
  return !(current.statusRank >= 30 && incomingRank < current.statusRank && !incomingTerminal);
}

async function applyOnboardingMirror(
  repository: Pick<MdiCaseStatusReconciliationRepository, "transitionOnboardingStatus">,
  input: { cognitoSub: string; next: OnboardingStatus; now: string },
): Promise<{ ok: true } | { ok: false; retryable: boolean }> {
  const expectedStatuses: OnboardingStatus[] = input.next === "billing_ready"
    ? ["clinical_review", "mdi_submitted"]
    : ["mdi_submitted"];

  for (const expected of expectedStatuses) {
    const transitioned = await repository.transitionOnboardingStatus({
      cognitoSub: input.cognitoSub,
      expected,
      next: input.next,
      now: input.now,
    });
    if (transitioned.ok) {
      return { ok: true };
    }
    if (transitioned.error.kind !== "stale_transition") {
      return {
        ok: false,
        retryable: transitioned.error.kind !== "validation_failed",
      };
    }
  }

  return { ok: true };
}

function reconciliationEventId(input: MdiCaseStatusSnapshot) {
  const digest = createHash("sha256")
    .update(`${input.mdiCaseId}:${input.caseStatus}:${input.providerTimestamp}`)
    .digest("hex")
    .slice(0, 20);
  return `mdi_evt_reconcile_${digest}`;
}

function storageFailure(
  error: AppDataError,
  stats: MdiCaseStatusReconciliationStats,
): MdiCaseStatusReconciliationResult {
  return {
    ok: false,
    error: {
      code: "storage_failure",
      message: error.message,
      retryable: error.kind !== "validation_failed",
      stats,
    },
  };
}

function onboardingFailure(
  retryable: boolean,
  stats: MdiCaseStatusReconciliationStats,
): MdiCaseStatusReconciliationResult {
  return {
    ok: false,
    error: {
      code: "storage_failure",
      message: "Failed to update onboarding mirror during MDI reconciliation",
      retryable,
      stats,
    },
  };
}
