import "server-only";

import {
  type AppDataError,
  type AppDataKey,
  type AppDataResult,
  type BillingStatus,
  type EvidenceEventRecord,
  type MdiCaseStatusMirrorRecord,
  type MdiLinkageRecord,
  type StripeBillingOpsReviewRecord,
  type StripeBillingReconciliationIndexRecord,
  type StripeLinkageRecord,
  recordEvidenceEvent,
} from "@/lib/dynamodb/app-data";
import {
  isTerminalMdiCaseStatus,
  onboardingTargetForMdiCaseStatus,
  type MdiCaseStatus,
} from "@/lib/mdi/case-status";

export type StripeMdiBillingSubscriptionSnapshot = {
  cancelAtPeriodEnd: boolean;
  status: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  currentPeriodEnd?: string;
  currentPeriodStart?: string;
  metadata?: Record<string, string>;
};

export type StripeMdiBillingReconciliationGateway = {
  getMdiCaseStatus(input: { mdiCaseId: string }): Promise<
    | {
        ok: true;
        value: {
          caseStatus: MdiCaseStatus;
          mdiCaseId: string;
          providerTimestamp: string;
        };
      }
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
  getStripeSubscription(input: { stripeSubscriptionId: string }): Promise<
    | { ok: true; value: StripeMdiBillingSubscriptionSnapshot }
    | {
        ok: false;
        error: {
          code: "not_found" | "provider_unavailable";
          message: string;
          retryable: boolean;
          status?: number;
        };
      }
  >;
  listRecentStripeSubscriptions(input: {
    cursor?: string;
    limit?: number;
    stage: "production" | "staging";
  }): Promise<
    | {
        ok: true;
        value: {
          items: StripeMdiBillingSubscriptionSnapshot[];
          nextCursor?: string;
        };
      }
    | {
        ok: false;
        error: {
          code: "provider_unavailable";
          message: string;
          retryable: boolean;
          status?: number;
        };
      }
  >;
};

export type StripeMdiBillingReconciliationRepository = {
  findPatientByStripePointer(input:
    | { pointerType: "customer"; stripeCustomerId: string }
    | { pointerType: "subscription"; stripeSubscriptionId: string }
  ): Promise<AppDataResult<string | null>>;
  getMdiCaseStatusMirror(mdiCaseId: string): Promise<AppDataResult<MdiCaseStatusMirrorRecord | null>>;
  getMdiLinkage(cognitoSub: string): Promise<AppDataResult<MdiLinkageRecord | null>>;
  getStripeLinkage(cognitoSub: string): Promise<AppDataResult<StripeLinkageRecord | null>>;
  linkStripeCustomer(input: {
    billingStatus: BillingStatus;
    cognitoSub: string;
    now: string;
    stripeCustomerId: string;
    allowedCurrentBillingStatuses?: BillingStatus[];
    stripeBillingStatusObservedAt?: string;
    stripeCurrentPeriodEnd?: string;
    stripeCurrentPeriodStart?: string;
    stripeSubscriptionId?: string;
  }): Promise<AppDataResult<StripeLinkageRecord>>;
  listStripeBillingReconciliationItems(input: {
    exclusiveStartKey?: AppDataKey;
    limit?: number;
  }): Promise<AppDataResult<{
    items: StripeBillingReconciliationIndexRecord[];
    nextKey?: AppDataKey;
  }>>;
  recordEvidenceEvent(
    input: Parameters<typeof recordEvidenceEvent>[1],
  ): Promise<AppDataResult<EvidenceEventRecord>>;
  recordStripeBillingOpsReview(input: {
    now: string;
    reason: "unpaired_stripe_subscription";
    stage: "production" | "staging";
    stripeCustomerId: string;
    stripeSubscriptionId: string;
  }): Promise<AppDataResult<StripeBillingOpsReviewRecord>>;
};

export type StripeMdiBillingReconciliationStats = {
  checked: number;
  corrected: number;
  ok: number;
  opsReview: number;
  providerUnavailable: number;
  skippedMissingLinkage: number;
  storageFailures: number;
  stripeDiscovered: number;
};

export type StripeMdiBillingReconciliationResult =
  | {
      ok: true;
      value: {
        nextKey?: AppDataKey;
        nextStripeCursor?: string;
        stats: StripeMdiBillingReconciliationStats;
      };
    }
  | {
      ok: false;
      error: {
        code: "provider_unavailable" | "storage_failure";
        message: string;
        retryable: boolean;
        stats: StripeMdiBillingReconciliationStats;
      };
    };

type Candidate = {
  source: "local" | "stripe";
  cognitoSub?: string;
  metadata?: Record<string, string>;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
};

export async function reconcileStripeMdiBilling(
  input: {
    exclusiveStartKey?: AppDataKey;
    limit?: number;
    now: string;
    stage?: "production" | "staging";
    stripeCursor?: string;
  },
  deps: {
    gateway: StripeMdiBillingReconciliationGateway;
    repository: StripeMdiBillingReconciliationRepository;
  },
): Promise<StripeMdiBillingReconciliationResult> {
  const stats = emptyStats();
  const local = await deps.repository.listStripeBillingReconciliationItems({
    exclusiveStartKey: input.exclusiveStartKey,
    limit: input.limit,
  });
  if (!local.ok) {
    return storageFailure(local.error, stats);
  }

  const discovered = await deps.gateway.listRecentStripeSubscriptions({
    cursor: input.stripeCursor,
    limit: input.limit,
    stage: input.stage ?? "staging",
  });
  if (!discovered.ok) {
    return providerFailure(discovered.error.message, discovered.error.retryable, stats);
  }

  const candidates = mergeCandidates(
    local.value.items.map((item): Candidate => ({
      cognitoSub: item.cognitoSub,
      source: "local",
      stripeCustomerId: item.stripeCustomerId,
      stripeSubscriptionId: item.stripeSubscriptionId,
    })),
    discovered.value.items.map((item): Candidate => ({
      metadata: item.metadata,
      source: "stripe",
      stripeCustomerId: item.stripeCustomerId,
      stripeSubscriptionId: item.stripeSubscriptionId,
    })),
  );
  stats.stripeDiscovered = discovered.value.items.length;

  for (const candidate of candidates) {
    stats.checked += 1;
    const reconciled = await reconcileCandidate(
      candidate,
      {
        now: input.now,
        stage: input.stage ?? "staging",
      },
      deps,
      stats,
    );
    if (!reconciled.ok) {
      return reconciled.error.code === "storage_failure"
        ? storageFailure(reconciled.error.error, stats)
        : providerFailure(reconciled.error.message, reconciled.error.retryable, stats);
    }
  }

  return {
    ok: true,
    value: {
      nextKey: local.value.nextKey,
      nextStripeCursor: discovered.value.nextCursor,
      stats,
    },
  };
}

async function reconcileCandidate(
  candidate: Candidate,
  input: { now: string; stage: "production" | "staging" },
  deps: {
    gateway: StripeMdiBillingReconciliationGateway;
    repository: StripeMdiBillingReconciliationRepository;
  },
  stats: StripeMdiBillingReconciliationStats,
): Promise<
  | { ok: true }
  | {
      ok: false;
      error:
        | { code: "provider_unavailable"; message: string; retryable: boolean }
        | { code: "storage_failure"; error: AppDataError };
    }
> {
  const subscription = await deps.gateway.getStripeSubscription({
    stripeSubscriptionId: candidate.stripeSubscriptionId,
  });
  if (!subscription.ok && subscription.error.code === "provider_unavailable") {
    stats.providerUnavailable += 1;
    return { ok: false, error: { code: "provider_unavailable", message: subscription.error.message, retryable: subscription.error.retryable } };
  }

  const stripeStatus = subscription.ok
    ? billingStatusForStripeSubscription(subscription.value)
    : "canceled";
  const cognitoSub = await resolveCognitoSub(candidate, deps.repository);
  if (!cognitoSub.ok) {
    return { ok: false, error: { code: "storage_failure", error: cognitoSub.error } };
  }
  if (!cognitoSub.value) {
    const recorded = await deps.repository.recordStripeBillingOpsReview({
      now: input.now,
      reason: "unpaired_stripe_subscription",
      stage: input.stage,
      stripeCustomerId: candidate.stripeCustomerId,
      stripeSubscriptionId: candidate.stripeSubscriptionId,
    });
    if (!recorded.ok) {
      return { ok: false, error: { code: "storage_failure", error: recorded.error } };
    }
    stats.skippedMissingLinkage += 1;
    stats.opsReview += 1;
    return { ok: true };
  }

  const stripeLinkage = await deps.repository.getStripeLinkage(cognitoSub.value);
  if (!stripeLinkage.ok) {
    return { ok: false, error: { code: "storage_failure", error: stripeLinkage.error } };
  }
  if (
    !stripeLinkage.value ||
    stripeLinkage.value.stripeSubscriptionId !== candidate.stripeSubscriptionId
  ) {
    return recordReviewEvidence(deps.repository, {
      cognitoSub: cognitoSub.value,
      metadata: candidate.metadata,
      now: input.now,
      outcome: "ops_review_required",
      reason: "unpaired_stripe_subscription",
      status: "recorded",
      stripeCustomerId: candidate.stripeCustomerId,
      stripeSubscriptionId: candidate.stripeSubscriptionId,
      stats,
    });
  }

  const mdiLinkage = await deps.repository.getMdiLinkage(cognitoSub.value);
  if (!mdiLinkage.ok) {
    return { ok: false, error: { code: "storage_failure", error: mdiLinkage.error } };
  }
  if (!mdiLinkage.value?.mdiCaseId) {
    return recordReviewEvidence(deps.repository, {
      cognitoSub: cognitoSub.value,
      now: input.now,
      outcome: "ops_review_required",
      reason: "missing_mdi_linkage",
      status: "recorded",
      stripeCustomerId: candidate.stripeCustomerId,
      stripeSubscriptionId: candidate.stripeSubscriptionId,
      stats,
    });
  }

  const providerMdi = await deps.gateway.getMdiCaseStatus({
    mdiCaseId: mdiLinkage.value.mdiCaseId,
  });
  if (!providerMdi.ok) {
    stats.providerUnavailable += 1;
    return { ok: false, error: { code: "provider_unavailable", message: providerMdi.error.message, retryable: providerMdi.error.retryable } };
  }

  const localMirror = await deps.repository.getMdiCaseStatusMirror(mdiLinkage.value.mdiCaseId);
  if (!localMirror.ok) {
    return { ok: false, error: { code: "storage_failure", error: localMirror.error } };
  }

  if (stripeStatus === "canceled" || stripeStatus === "cancel_pending" || stripeStatus === "past_due") {
    let corrected = false;
    if (stripeStatus !== stripeLinkage.value.billingStatus) {
      const linked = await deps.repository.linkStripeCustomer({
        allowedCurrentBillingStatuses: [stripeLinkage.value.billingStatus],
        billingStatus: stripeStatus,
        cognitoSub: cognitoSub.value,
        now: input.now,
        stripeBillingStatusObservedAt: input.now,
        stripeCurrentPeriodEnd: subscription.ok ? subscription.value.currentPeriodEnd : undefined,
        stripeCurrentPeriodStart: subscription.ok ? subscription.value.currentPeriodStart : undefined,
        stripeCustomerId: stripeLinkage.value.stripeCustomerId,
        stripeSubscriptionId: stripeLinkage.value.stripeSubscriptionId,
      });
      if (!linked.ok) {
        return { ok: false, error: { code: "storage_failure", error: linked.error } };
      }
      corrected = true;
    }
    if (stripeStatus === "past_due") {
      return recordReviewEvidence(deps.repository, {
        cognitoSub: cognitoSub.value,
        corrected,
        now: input.now,
        outcome: "ops_review_required",
        reason: "failed_payment_requires_review",
        status: "recorded",
        stripeCustomerId: stripeLinkage.value.stripeCustomerId,
        stripeSubscriptionId: stripeLinkage.value.stripeSubscriptionId ?? candidate.stripeSubscriptionId,
        stats,
      });
    }
    if (corrected) {
      return recordReviewEvidence(deps.repository, {
        cognitoSub: cognitoSub.value,
        corrected: true,
        now: input.now,
        outcome: "mirror_corrected",
        reason: stripeStatus === "canceled" ? "stripe_already_canceled" : "stripe_cancel_pending",
        status: "succeeded",
        stripeCustomerId: stripeLinkage.value.stripeCustomerId,
        stripeSubscriptionId: stripeLinkage.value.stripeSubscriptionId ?? candidate.stripeSubscriptionId,
        stats,
      });
    }
    stats.ok += 1;
    return { ok: true };
  }

  if (isTerminalMdiCaseStatus(providerMdi.value.caseStatus)) {
    return recordReviewEvidence(deps.repository, {
      cognitoSub: cognitoSub.value,
      mdiCaseId: mdiLinkage.value.mdiCaseId,
      mdiPatientId: mdiLinkage.value.mdiPatientId,
      now: input.now,
      outcome: "ops_review_required",
      reason: "mdi_terminal_with_active_billing",
      status: "recorded",
      stripeCustomerId: stripeLinkage.value.stripeCustomerId,
      stripeSubscriptionId: stripeLinkage.value.stripeSubscriptionId ?? candidate.stripeSubscriptionId,
      stats,
    });
  }

  const target = onboardingTargetForMdiCaseStatus(providerMdi.value.caseStatus);
  if (target !== "billing_ready") {
    return recordReviewEvidence(deps.repository, {
      cognitoSub: cognitoSub.value,
      mdiCaseId: mdiLinkage.value.mdiCaseId,
      mdiPatientId: mdiLinkage.value.mdiPatientId,
      now: input.now,
      outcome: "ops_review_required",
      reason: "active_without_billing_ready",
      status: "recorded",
      stripeCustomerId: stripeLinkage.value.stripeCustomerId,
      stripeSubscriptionId: stripeLinkage.value.stripeSubscriptionId ?? candidate.stripeSubscriptionId,
      stats,
    });
  }

  if (!localMirror.value || localMirror.value.caseStatus !== providerMdi.value.caseStatus) {
    return recordReviewEvidence(deps.repository, {
      cognitoSub: cognitoSub.value,
      mdiCaseId: mdiLinkage.value.mdiCaseId,
      mdiPatientId: mdiLinkage.value.mdiPatientId,
      now: input.now,
      outcome: "ops_review_required",
      reason: "local_mirror_stale",
      status: "recorded",
      stripeCustomerId: stripeLinkage.value.stripeCustomerId,
      stripeSubscriptionId: stripeLinkage.value.stripeSubscriptionId ?? candidate.stripeSubscriptionId,
      stats,
    });
  }

  stats.ok += 1;
  return { ok: true };
}

async function resolveCognitoSub(
  candidate: Candidate,
  repository: Pick<
    StripeMdiBillingReconciliationRepository,
    "findPatientByStripePointer" | "getStripeLinkage"
  >,
): Promise<AppDataResult<string | null>> {
  if (candidate.cognitoSub) {
    return { ok: true, value: candidate.cognitoSub };
  }
  const bySubscription = await repository.findPatientByStripePointer({
    pointerType: "subscription",
    stripeSubscriptionId: candidate.stripeSubscriptionId,
  });
  if (!bySubscription.ok || bySubscription.value) {
    return bySubscription;
  }
  const byCustomer = await repository.findPatientByStripePointer({
    pointerType: "customer",
    stripeCustomerId: candidate.stripeCustomerId,
  });
  if (!byCustomer.ok || byCustomer.value) {
    return byCustomer;
  }
  const metadataCognitoSub = candidate.metadata?.cognito_sub;
  if (!metadataCognitoSub || !isSafeCognitoSubHint(metadataCognitoSub)) {
    return { ok: true, value: null };
  }
  const hintedLinkage = await repository.getStripeLinkage(metadataCognitoSub);
  if (!hintedLinkage.ok) {
    return hintedLinkage;
  }
  if (
    hintedLinkage.value &&
    hintedLinkage.value.stripeCustomerId === candidate.stripeCustomerId &&
    hintedLinkage.value.stripeSubscriptionId === candidate.stripeSubscriptionId
  ) {
    return { ok: true, value: metadataCognitoSub };
  }
  return { ok: true, value: null };
}

async function recordReviewEvidence(
  repository: Pick<StripeMdiBillingReconciliationRepository, "recordEvidenceEvent">,
  input: {
    cognitoSub: string;
    now: string;
    outcome: "mirror_corrected" | "ok" | "ops_review_required" | "provider_unavailable" | "skipped";
    reason: ReconciliationReasonCode;
    status: "recorded" | "succeeded" | "skipped";
    stats: StripeMdiBillingReconciliationStats;
    stripeCustomerId: string;
    stripeSubscriptionId: string;
    corrected?: boolean;
    mdiCaseId?: string;
    mdiPatientId?: string;
    metadata?: Record<string, string>;
  },
): Promise<{ ok: true } | { ok: false; error: { code: "storage_failure"; error: AppDataError } }> {
  const evidence = await repository.recordEvidenceEvent({
    actorType: "system",
    cognitoSub: input.cognitoSub,
    eventCategory: "stripe_billing",
    eventId: `stripe:billing_reconcile:${input.stripeSubscriptionId}:${input.reason}`,
    eventType: "stripe_mdi_billing_reconciliation",
    occurredAt: input.now,
    recordedAt: input.now,
    mdiCaseId: input.mdiCaseId,
    mdiPatientId: input.mdiPatientId,
    metadata: {
      outcome: input.outcome,
      reason_code: input.reason,
    },
    source: "stripe",
    status: input.status,
    stripeCustomerId: input.stripeCustomerId,
    stripeSubscriptionId: input.stripeSubscriptionId,
    summaryCode: "STRIPE_MDI_BILLING_RECONCILIATION",
  });
  if (!evidence.ok && evidence.error.kind !== "conditional_conflict") {
    return { ok: false, error: { code: "storage_failure", error: evidence.error } };
  }
  if (input.outcome === "mirror_corrected") {
    input.stats.corrected += 1;
  } else if (input.outcome === "ops_review_required") {
    input.stats.opsReview += 1;
  } else {
    input.stats.ok += 1;
  }
  if (input.corrected && input.outcome !== "mirror_corrected") {
    input.stats.corrected += 1;
  }
  return { ok: true };
}

type ReconciliationReasonCode =
  | "active_without_billing_ready"
  | "failed_payment_requires_review"
  | "local_mirror_stale"
  | "mdi_terminal_with_active_billing"
  | "missing_mdi_linkage"
  | "missing_stripe_linkage"
  | "stripe_already_canceled"
  | "stripe_cancel_pending"
  | "unpaired_stripe_subscription";

function billingStatusForStripeSubscription(
  subscription: StripeMdiBillingSubscriptionSnapshot,
): BillingStatus {
  if (subscription.cancelAtPeriodEnd) {
    return "cancel_pending";
  }
  switch (subscription.status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
      return "canceled";
    default:
      return "payment_method_pending";
  }
}

function mergeCandidates(local: Candidate[], discovered: Candidate[]) {
  const bySubscription = new Map<string, Candidate>();
  for (const candidate of local) {
    bySubscription.set(candidate.stripeSubscriptionId, candidate);
  }
  for (const candidate of discovered) {
    if (!bySubscription.has(candidate.stripeSubscriptionId)) {
      bySubscription.set(candidate.stripeSubscriptionId, candidate);
    }
  }
  return [...bySubscription.values()];
}

function isSafeCognitoSubHint(value: string) {
  return /^(?:cognito-sub-[A-Za-z0-9]+|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i
    .test(value);
}

function emptyStats(): StripeMdiBillingReconciliationStats {
  return {
    checked: 0,
    corrected: 0,
    ok: 0,
    opsReview: 0,
    providerUnavailable: 0,
    skippedMissingLinkage: 0,
    storageFailures: 0,
    stripeDiscovered: 0,
  };
}

function providerFailure(
  message: string,
  retryable: boolean,
  stats: StripeMdiBillingReconciliationStats,
): StripeMdiBillingReconciliationResult {
  return {
    ok: false,
    error: {
      code: "provider_unavailable",
      message,
      retryable,
      stats,
    },
  };
}

function storageFailure(
  error: AppDataError,
  stats: StripeMdiBillingReconciliationStats,
): StripeMdiBillingReconciliationResult {
  stats.storageFailures += 1;
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
