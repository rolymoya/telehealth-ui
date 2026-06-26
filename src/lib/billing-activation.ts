import "server-only";

import { createHash } from "node:crypto";
import type Stripe from "stripe";
import {
  type AppDataError,
  type AppDataRepository,
  type AppDataResult,
  type BillingStatus,
  type EvidenceEventRecord,
  type MdiCaseStatusMirrorRecord,
  type MdiLinkageRecord,
  type StripeLinkageRecord,
  getMdiLinkage,
  getStripeLinkage,
  linkStripeCustomer,
  mdiCaseStatusMirrorKey,
  recordEvidenceEvent,
} from "@/lib/dynamodb/app-data";
import {
  type DynamoDbAppDataRepository,
  getMdiLinkageDynamoDb,
  getStripeLinkageDynamoDb,
  linkStripeCustomerDynamoDb,
  recordEvidenceEventDynamoDb,
} from "@/lib/dynamodb/app-data-dynamodb";
import { createStripeSubscriptionParams } from "@/lib/stripe";

export type BillingActivationStage = "production" | "staging";

type StripeSubscriptionCreate = (
  params: Stripe.SubscriptionCreateParams,
  options?: Stripe.RequestOptions,
) => Promise<Stripe.Subscription>;

type StripeSubscriptionCancel = (
  id: string,
  params?: Stripe.SubscriptionCancelParams,
  options?: Stripe.RequestOptions,
) => Promise<Stripe.Subscription>;

type StripeSubscriptionUpdate = (
  id: string,
  params?: Stripe.SubscriptionUpdateParams,
  options?: Stripe.RequestOptions,
) => Promise<Stripe.Subscription>;

export type BillingActivationStripeClient = {
  subscriptions: {
    cancel: StripeSubscriptionCancel;
    create: StripeSubscriptionCreate;
    update: StripeSubscriptionUpdate;
  };
};

export type BillingActivationRepository = {
  getMdiCaseStatusMirror(mdiCaseId: string): Promise<AppDataResult<MdiCaseStatusMirrorRecord | null>>;
  getMdiLinkage(cognitoSub: string): Promise<AppDataResult<MdiLinkageRecord | null>>;
  getStripeLinkage(cognitoSub: string): Promise<AppDataResult<StripeLinkageRecord | null>>;
  linkStripeCustomer(input: {
    allowedCurrentBillingStatuses?: BillingStatus[];
    billingStatus: BillingStatus;
    cognitoSub: string;
    now: string;
    stripeBillingStatusObservedAt?: string;
    stripeCurrentPeriodEnd?: string;
    stripeCurrentPeriodStart?: string;
    stripeCustomerId: string;
    stripeSubscriptionId?: string;
  }): Promise<AppDataResult<StripeLinkageRecord>>;
  recordEvidenceEvent(
    input: Parameters<typeof recordEvidenceEvent>[1],
  ): Promise<AppDataResult<EvidenceEventRecord>>;
};

export type BillingActivationResult =
  | { ok: true; status: "not_ready" }
  | { ok: true; status: "await_payment_method" }
  | { ok: true; status: "clinical_closed" }
  | { ok: true; status: "already_subscribed"; stripeSubscriptionId: string }
  | { ok: true; status: "subscription_created"; stripeSubscriptionId: string }
  | { ok: false; code: "invalid_stripe_metadata" | "storage_unavailable" | "stripe_unavailable" };

export type BillingCancellationResult =
  | { ok: true; status: "not_active" }
  | { ok: true; status: "already_cancel_pending"; stripeSubscriptionId: string }
  | { ok: true; status: "already_canceled"; stripeSubscriptionId: string }
  | { ok: true; status: "subscription_canceled"; stripeSubscriptionId: string }
  | { ok: false; code: "storage_unavailable" | "stripe_unavailable" };

export type PatientSubscriptionCancellationResult =
  | { ok: true; status: "not_active" }
  | { ok: true; status: "already_cancel_pending"; stripeSubscriptionId: string }
  | { ok: true; status: "already_canceled"; stripeSubscriptionId: string }
  | { ok: true; status: "subscription_cancel_pending"; stripeSubscriptionId: string }
  | { ok: false; code: "mdi_unavailable" | "storage_unavailable" | "stripe_unavailable" };

export type MdiCancellationActionClient = {
  requestCancellationReview(input: {
    cognitoSub: string;
    idempotencyKey: string;
    mdiCaseId: string;
    mdiPatientId: string;
    now: string;
    stripeSubscriptionId: string;
  }): Promise<
    | { ok: true; outcome: "requested" | "skipped" | "unsupported" }
    | { ok: false; retryable: boolean }
  >;
};

export function createUnsupportedMdiCancellationAction(): MdiCancellationActionClient {
  return {
    async requestCancellationReview() {
      return { ok: true, outcome: "unsupported" };
    },
  };
}

export function createInMemoryBillingActivationRepository(
  repository: AppDataRepository,
): BillingActivationRepository {
  return {
    async getMdiCaseStatusMirror(mdiCaseId) {
      const record = repository.get(mdiCaseStatusMirrorKey(mdiCaseId));
      if (!record.ok || !record.value) {
        return record as AppDataResult<MdiCaseStatusMirrorRecord | null>;
      }
      if (record.value.recordType !== "mdiCaseStatusMirror") {
        return appDataErr("MDI case status mirror key contained another record type");
      }
      return { ok: true, value: record.value };
    },
    async getMdiLinkage(cognitoSub) {
      return getMdiLinkage(repository, cognitoSub);
    },
    async getStripeLinkage(cognitoSub) {
      return getStripeLinkage(repository, cognitoSub);
    },
    async linkStripeCustomer(input) {
      return linkStripeCustomer(repository, input);
    },
    async recordEvidenceEvent(input) {
      return recordEvidenceEvent(repository, input);
    },
  };
}

export function createDynamoDbBillingActivationRepository(
  repository: Pick<DynamoDbAppDataRepository, "get" | "transactWrite">,
): BillingActivationRepository {
  return {
    async getMdiCaseStatusMirror(mdiCaseId) {
      const record = await repository.get(mdiCaseStatusMirrorKey(mdiCaseId));
      if (!record.ok || !record.value) {
        return record as AppDataResult<MdiCaseStatusMirrorRecord | null>;
      }
      if (record.value.recordType !== "mdiCaseStatusMirror") {
        return appDataErr("MDI case status mirror key contained another record type");
      }
      return { ok: true, value: record.value };
    },
    async getMdiLinkage(cognitoSub) {
      return getMdiLinkageDynamoDb(repository, cognitoSub);
    },
    async getStripeLinkage(cognitoSub) {
      return getStripeLinkageDynamoDb(repository, cognitoSub);
    },
    async linkStripeCustomer(input) {
      return linkStripeCustomerDynamoDb(repository, input);
    },
    async recordEvidenceEvent(input) {
      return recordEvidenceEventDynamoDb(repository, input);
    },
  };
}

export async function activateBillingAfterClinicalUnlock(input: {
  cognitoSub: string;
  mdiCaseId: string;
  now: string;
  priceId: string;
  repository: BillingActivationRepository;
  stage: BillingActivationStage;
  stripe: BillingActivationStripeClient;
}): Promise<BillingActivationResult> {
  const context = await readActivationContext(input.repository, input.cognitoSub, input.mdiCaseId);
  if (!context.ok) {
    return context;
  }
  if (context.status !== "ready") {
    return context;
  }

  const existing = context.stripeLinkage;
  if (existing.stripeSubscriptionId && isSubscribedStatus(existing.billingStatus)) {
    return {
      ok: true,
      status: "already_subscribed",
      stripeSubscriptionId: existing.stripeSubscriptionId,
    };
  }
  if (existing.billingStatus !== "payment_method_collected") {
    return { ok: true, status: "await_payment_method" };
  }

  const metadata = stripeMetadataForPatient({
    cognitoSub: input.cognitoSub,
    mdiCaseId: context.mdiLinkage.mdiCaseId,
    mdiPatientId: context.mdiLinkage.mdiPatientId,
    stage: input.stage,
  });
  const params = createStripeSubscriptionParams({
    customerId: existing.stripeCustomerId,
    metadata,
    priceId: input.priceId,
  });
  if (!params.ok) {
    return { ok: false, code: "invalid_stripe_metadata" };
  }

  let subscription: Stripe.Subscription;
  try {
    subscription = await input.stripe.subscriptions.create(
      params.value,
      {
        idempotencyKey: idempotencyKey(
          "subscription",
          input.stage,
          `${input.cognitoSub}:${context.mdiLinkage.mdiCaseId}`,
        ),
      },
    );
  } catch {
    return { ok: false, code: "stripe_unavailable" };
  }

  const postStripeContext = await readActivationContext(
    input.repository,
    input.cognitoSub,
    input.mdiCaseId,
  );
  if (!postStripeContext.ok) {
    return postStripeContext;
  }
  if (postStripeContext.status !== "ready") {
    const canceled = await cancelCreatedSubscription(input.stripe, {
      cognitoSub: input.cognitoSub,
      mdiCaseId: input.mdiCaseId,
      now: input.now,
      stage: input.stage,
      stripeSubscriptionId: subscription.id,
    });
    if (!canceled.ok) {
      return { ok: false, code: "stripe_unavailable" };
    }
    return postStripeContext;
  }

  const activationStripeLinkage = postStripeContext.stripeLinkage;
  const billingStatus = billingStatusForStripeSubscription(subscription.status);
  const evidence = await recordBillingActivationEvidence(input.repository, {
    cognitoSub: input.cognitoSub,
    mdiCaseId: context.mdiLinkage.mdiCaseId,
    mdiPatientId: context.mdiLinkage.mdiPatientId,
    now: input.now,
    status: "subscription_created",
    stripeCustomerId: activationStripeLinkage.stripeCustomerId,
    stripeSubscriptionId: subscription.id,
  });
  if (!evidence.ok) {
    return { ok: false, code: "storage_unavailable" };
  }

  const linked = await input.repository.linkStripeCustomer({
    allowedCurrentBillingStatuses: ["payment_method_collected"],
    billingStatus,
    cognitoSub: input.cognitoSub,
    now: input.now,
    stripeBillingStatusObservedAt: input.now,
    stripeCurrentPeriodEnd: stripePeriodIso(stripeObjectNumber(subscription, "current_period_end")),
    stripeCurrentPeriodStart: stripePeriodIso(stripeObjectNumber(subscription, "current_period_start")),
    stripeCustomerId: activationStripeLinkage.stripeCustomerId,
    stripeSubscriptionId: subscription.id,
  });
  if (!linked.ok) {
    return handlePostSubscriptionWriteConflict({
      cognitoSub: input.cognitoSub,
      expectedSubscriptionId: subscription.id,
      repository: input.repository,
    });
  }

  return {
    ok: true,
    status: "subscription_created",
    stripeSubscriptionId: subscription.id,
  };
}

export async function cancelActiveBillingAfterClinicalClosure(input: {
  cognitoSub: string;
  mdiCaseId: string;
  now: string;
  repository: BillingActivationRepository;
  stage: BillingActivationStage;
  stripe: BillingActivationStripeClient;
}): Promise<BillingCancellationResult> {
  const stripeLinkage = await input.repository.getStripeLinkage(input.cognitoSub);
  if (!stripeLinkage.ok) {
    return { ok: false, code: "storage_unavailable" };
  }
  const existing = stripeLinkage.value;
  if (!existing?.stripeSubscriptionId) {
    return { ok: true, status: "not_active" };
  }
  if (existing.billingStatus === "canceled") {
    return {
      ok: true,
      status: "already_canceled",
      stripeSubscriptionId: existing.stripeSubscriptionId,
    };
  }
  if (
    existing.billingStatus !== "active" &&
    existing.billingStatus !== "past_due" &&
    existing.billingStatus !== "cancel_pending"
  ) {
    return { ok: true, status: "not_active" };
  }

  try {
    await input.stripe.subscriptions.cancel(
      existing.stripeSubscriptionId,
      {},
      {
        idempotencyKey: idempotencyKey(
          "subscription-cancel",
          input.stage,
          `${input.cognitoSub}:${input.mdiCaseId}:${existing.stripeSubscriptionId}`,
        ),
      },
    );
  } catch {
    return { ok: false, code: "stripe_unavailable" };
  }

  const linked = await input.repository.linkStripeCustomer({
    allowedCurrentBillingStatuses: ["active", "past_due", "cancel_pending"],
    billingStatus: "canceled",
    cognitoSub: input.cognitoSub,
    now: input.now,
    stripeBillingStatusObservedAt: input.now,
    stripeCurrentPeriodEnd: existing.stripeCurrentPeriodEnd,
    stripeCurrentPeriodStart: existing.stripeCurrentPeriodStart,
    stripeCustomerId: existing.stripeCustomerId,
    stripeSubscriptionId: existing.stripeSubscriptionId,
  });
  if (!linked.ok) {
    const reread = await input.repository.getStripeLinkage(input.cognitoSub);
    if (
      reread.ok &&
      reread.value?.stripeSubscriptionId === existing.stripeSubscriptionId &&
      reread.value.billingStatus === "canceled"
    ) {
      return {
        ok: true,
        status: "already_canceled",
        stripeSubscriptionId: existing.stripeSubscriptionId,
      };
    }
    return { ok: false, code: "storage_unavailable" };
  }

  const evidence = await recordBillingActivationEvidence(input.repository, {
    cognitoSub: input.cognitoSub,
    mdiCaseId: input.mdiCaseId,
    now: input.now,
    previousStatus: existing.billingStatus,
    status: "subscription_canceled",
    stripeCustomerId: existing.stripeCustomerId,
    stripeSubscriptionId: existing.stripeSubscriptionId,
  });
  if (!evidence.ok) {
    return { ok: false, code: "storage_unavailable" };
  }

  return {
    ok: true,
    status: "subscription_canceled",
    stripeSubscriptionId: existing.stripeSubscriptionId,
  };
}

export async function cancelPatientSubscriptionAtPeriodEnd(input: {
  cognitoSub: string;
  mdiCancellationAction?: MdiCancellationActionClient;
  now: string;
  repository: BillingActivationRepository;
  stage: BillingActivationStage;
  stripe: BillingActivationStripeClient;
}): Promise<PatientSubscriptionCancellationResult> {
  const stripeLinkage = await input.repository.getStripeLinkage(input.cognitoSub);
  if (!stripeLinkage.ok) {
    return { ok: false, code: "storage_unavailable" };
  }
  const existing = stripeLinkage.value;
  if (!existing?.stripeSubscriptionId) {
    return { ok: true, status: "not_active" };
  }
  if (existing.billingStatus === "canceled") {
    return {
      ok: true,
      status: "already_canceled",
      stripeSubscriptionId: existing.stripeSubscriptionId,
    };
  }
  if (existing.billingStatus === "cancel_pending") {
    return {
      ok: true,
      status: "already_cancel_pending",
      stripeSubscriptionId: existing.stripeSubscriptionId,
    };
  }
  if (existing.billingStatus !== "active" && existing.billingStatus !== "past_due") {
    return { ok: true, status: "not_active" };
  }

  const mdiLinkage = await input.repository.getMdiLinkage(input.cognitoSub);
  if (!mdiLinkage.ok) {
    return { ok: false, code: "storage_unavailable" };
  }

  if (mdiLinkage.value?.mdiCaseId && mdiLinkage.value.mdiPatientId) {
    const action = await (
      input.mdiCancellationAction ?? createUnsupportedMdiCancellationAction()
    ).requestCancellationReview({
      cognitoSub: input.cognitoSub,
      idempotencyKey: idempotencyKey(
        "mdi-cancellation-review",
        input.stage,
        `${input.cognitoSub}:${mdiLinkage.value.mdiCaseId}:${existing.stripeSubscriptionId}`,
      ),
      mdiCaseId: mdiLinkage.value.mdiCaseId,
      mdiPatientId: mdiLinkage.value.mdiPatientId,
      now: input.now,
      stripeSubscriptionId: existing.stripeSubscriptionId,
    });
    if (!action.ok) {
      return { ok: false, code: "mdi_unavailable" };
    }
  }

  let subscription: Stripe.Subscription;
  try {
    subscription = await input.stripe.subscriptions.update(
      existing.stripeSubscriptionId,
      { cancel_at_period_end: true },
      {
        idempotencyKey: idempotencyKey(
          "subscription-cancel-period-end",
          input.stage,
          `${input.cognitoSub}:${existing.stripeSubscriptionId}`,
        ),
      },
    );
  } catch {
    return { ok: false, code: "stripe_unavailable" };
  }

  const linked = await input.repository.linkStripeCustomer({
    allowedCurrentBillingStatuses: ["active", "past_due"],
    billingStatus: "cancel_pending",
    cognitoSub: input.cognitoSub,
    now: input.now,
    stripeBillingStatusObservedAt: input.now,
    stripeCurrentPeriodEnd: stripePeriodIso(stripeObjectNumber(subscription, "current_period_end")) ??
      existing.stripeCurrentPeriodEnd,
    stripeCurrentPeriodStart: stripePeriodIso(stripeObjectNumber(subscription, "current_period_start")) ??
      existing.stripeCurrentPeriodStart,
    stripeCustomerId: existing.stripeCustomerId,
    stripeSubscriptionId: existing.stripeSubscriptionId,
  });
  if (!linked.ok) {
    const reread = await input.repository.getStripeLinkage(input.cognitoSub);
    if (
      reread.ok &&
      reread.value?.stripeSubscriptionId === existing.stripeSubscriptionId &&
      reread.value.billingStatus === "cancel_pending"
    ) {
      return {
        ok: true,
        status: "already_cancel_pending",
        stripeSubscriptionId: existing.stripeSubscriptionId,
      };
    }
    return { ok: false, code: "storage_unavailable" };
  }

  const evidence = await recordBillingActivationEvidence(input.repository, {
    cognitoSub: input.cognitoSub,
    mdiCaseId: mdiLinkage.value?.mdiCaseId,
    mdiPatientId: mdiLinkage.value?.mdiPatientId,
    now: input.now,
    previousStatus: existing.billingStatus,
    status: "subscription_cancel_pending",
    stripeCustomerId: existing.stripeCustomerId,
    stripeSubscriptionId: existing.stripeSubscriptionId,
  });
  if (!evidence.ok) {
    return { ok: false, code: "storage_unavailable" };
  }

  if (mdiLinkage.value?.mdiCaseId && mdiLinkage.value.mdiPatientId) {
    const mdiReview = await recordMdiCancellationReviewEvidence(input.repository, {
      cognitoSub: input.cognitoSub,
      mdiCaseId: mdiLinkage.value.mdiCaseId,
      mdiPatientId: mdiLinkage.value.mdiPatientId,
      now: input.now,
      stripeSubscriptionId: existing.stripeSubscriptionId,
    });
    if (!mdiReview.ok) {
      return { ok: false, code: "storage_unavailable" };
    }
  }

  return {
    ok: true,
    status: "subscription_cancel_pending",
    stripeSubscriptionId: existing.stripeSubscriptionId,
  };
}

async function readActivationContext(
  repository: BillingActivationRepository,
  cognitoSub: string,
  mdiCaseId: string,
): Promise<
  | { ok: true; status: "ready"; mdiLinkage: MdiLinkageRecord & { mdiCaseId: string }; stripeLinkage: StripeLinkageRecord }
  | { ok: true; status: "not_ready" }
  | { ok: true; status: "await_payment_method" }
  | { ok: true; status: "clinical_closed" }
  | { ok: false; code: "storage_unavailable" }
> {
  const mdiLinkage = await repository.getMdiLinkage(cognitoSub);
  if (!mdiLinkage.ok) {
    return { ok: false, code: "storage_unavailable" };
  }
  if (!mdiLinkage.value?.mdiCaseId || mdiLinkage.value.mdiCaseId !== mdiCaseId) {
    return { ok: true, status: "not_ready" };
  }

  const mirror = await repository.getMdiCaseStatusMirror(mdiCaseId);
  if (!mirror.ok) {
    return { ok: false, code: "storage_unavailable" };
  }
  if (!mirror.value) {
    return { ok: true, status: "not_ready" };
  }
  if (mirror.value.caseStatus === "declined" || mirror.value.caseStatus === "cancelled") {
    return { ok: true, status: "clinical_closed" };
  }
  if (mirror.value.caseStatus !== "billing_ready") {
    return { ok: true, status: "not_ready" };
  }

  const stripeLinkage = await repository.getStripeLinkage(cognitoSub);
  if (!stripeLinkage.ok) {
    return { ok: false, code: "storage_unavailable" };
  }
  if (!stripeLinkage.value) {
    return { ok: true, status: "await_payment_method" };
  }

  return {
    ok: true,
    status: "ready",
    mdiLinkage: mdiLinkage.value as MdiLinkageRecord & { mdiCaseId: string },
    stripeLinkage: stripeLinkage.value,
  };
}

async function handlePostSubscriptionWriteConflict(input: {
  cognitoSub: string;
  expectedSubscriptionId: string;
  repository: BillingActivationRepository;
}): Promise<BillingActivationResult> {
  const reread = await input.repository.getStripeLinkage(input.cognitoSub);
  if (!reread.ok) {
    return { ok: false, code: "storage_unavailable" };
  }
  if (
    reread.value?.stripeSubscriptionId === input.expectedSubscriptionId &&
    isSubscribedStatus(reread.value.billingStatus)
  ) {
    return {
      ok: true,
      status: "already_subscribed",
      stripeSubscriptionId: input.expectedSubscriptionId,
    };
  }
  return { ok: false, code: "storage_unavailable" };
}

function billingStatusForStripeSubscription(status: string | null): BillingStatus {
  switch (status) {
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

function isSubscribedStatus(status: BillingStatus) {
  return status === "active" || status === "past_due" || status === "cancel_pending";
}

function stripeMetadataForPatient(input: {
  cognitoSub: string;
  mdiCaseId: string;
  mdiPatientId: string;
  stage: BillingActivationStage;
}) {
  return {
    app_patient_id: `app_patient_${stableDigest(input.cognitoSub).slice(0, 24)}`,
    apoth_stage: input.stage,
    cognito_sub: input.cognitoSub,
    mdi_case_id: input.mdiCaseId,
    mdi_patient_id: input.mdiPatientId,
  };
}

function stripePeriodIso(value: number | null | undefined) {
  return typeof value === "number" ? new Date(value * 1000).toISOString() : undefined;
}

function stripeObjectNumber(object: unknown, key: string) {
  if (typeof object !== "object" || object === null || Array.isArray(object)) {
    return null;
  }
  const value = (object as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function idempotencyKey(kind: string, stage: string, subject: string) {
  return `apoth:${stage}:${kind}:${stableDigest(subject)}`;
}

function stableDigest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function recordBillingActivationEvidence(
  repository: BillingActivationRepository,
  input: {
    cognitoSub: string;
    mdiCaseId?: string;
    mdiPatientId?: string;
    now: string;
    previousStatus?: BillingStatus;
    status: "subscription_created" | "subscription_cancel_pending" | "subscription_canceled";
    stripeCustomerId: string;
    stripeSubscriptionId: string;
  },
) {
  const event = await repository.recordEvidenceEvent({
    actorType: "vendor",
    cognitoSub: input.cognitoSub,
    eventCategory: "stripe_billing",
    eventId: input.status === "subscription_created"
      ? `stripe:billing:${input.stripeSubscriptionId}:active`
      : input.status === "subscription_cancel_pending"
        ? `stripe:billing:${input.stripeSubscriptionId}:cancel_pending`
        : `stripe:billing:${input.stripeSubscriptionId}:canceled`,
    eventType: input.status === "subscription_created"
      ? "stripe_billing_activated"
      : "stripe_billing_status_changed",
    occurredAt: input.now,
    recordedAt: input.now,
    mdiCaseId: input.mdiCaseId,
    mdiPatientId: input.mdiPatientId,
    metadata: input.status === "subscription_created"
      ? { status: "active" }
      : input.status === "subscription_cancel_pending"
        ? { status: "cancel_pending", previous_status: input.previousStatus ?? "active" }
        : { status: "canceled", previous_status: input.previousStatus ?? "active" },
    source: "stripe",
    status: input.status === "subscription_created" ? "succeeded" : "recorded",
    stripeCustomerId: input.stripeCustomerId,
    stripeSubscriptionId: input.stripeSubscriptionId,
    summaryCode: input.status === "subscription_created"
      ? "STRIPE_BILLING_ACTIVATED"
      : "STRIPE_BILLING_STATUS_CHANGED",
  });
  return event.ok || event.error.kind === "conditional_conflict"
    ? { ok: true as const }
    : { ok: false as const };
}

async function recordMdiCancellationReviewEvidence(
  repository: BillingActivationRepository,
  input: {
    cognitoSub: string;
    mdiCaseId: string;
    mdiPatientId: string;
    now: string;
    stripeSubscriptionId: string;
  },
) {
  const event = await repository.recordEvidenceEvent({
    actorType: "system",
    cognitoSub: input.cognitoSub,
    eventCategory: "mdi_handoff",
    eventId: `mdi:cancellation_review:${input.mdiCaseId}:${input.stripeSubscriptionId}`,
    eventType: "mdi_cancellation_review_requested",
    occurredAt: input.now,
    recordedAt: input.now,
    mdiCaseId: input.mdiCaseId,
    mdiPatientId: input.mdiPatientId,
    metadata: {
      outcome: "requested",
      reason_code: "patient_self_service_cancel",
      side_effect: "mdi_subscription_review",
    },
    source: "app",
    status: "recorded",
    stripeSubscriptionId: input.stripeSubscriptionId,
    summaryCode: "MDI_CANCELLATION_REVIEW_REQUESTED",
  });
  return event.ok || event.error.kind === "conditional_conflict"
    ? { ok: true as const }
    : { ok: false as const };
}

async function cancelCreatedSubscription(
  stripe: BillingActivationStripeClient,
  input: {
    cognitoSub: string;
    mdiCaseId: string;
    now: string;
    stage: BillingActivationStage;
    stripeSubscriptionId: string;
  },
) {
  try {
    await stripe.subscriptions.cancel(
      input.stripeSubscriptionId,
      {},
      {
        idempotencyKey: idempotencyKey(
          "subscription-cancel",
          input.stage,
          `${input.cognitoSub}:${input.mdiCaseId}:${input.stripeSubscriptionId}:${input.now}`,
        ),
      },
    );
  } catch {
    return { ok: false as const };
  }
  return { ok: true as const };
}

function appDataErr(message: string): AppDataResult<never> {
  return {
    ok: false,
    error: { kind: "validation_failed", message },
  };
}

function appDataFailure(error: AppDataError) {
  return error.kind === "validation_failed" ? "invalid_stripe_metadata" : "storage_unavailable";
}
