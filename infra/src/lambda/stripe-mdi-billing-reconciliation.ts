import type Stripe from "stripe";
import {
  mdiCaseStatusMirrorKey,
  operationalStatusKey,
  stripeBillingOpsReviewKey,
  stripeBillingReconciliationIndexPk,
  type AppDataKey,
  type AppDataRecord,
  type AppDataResult,
  type MdiCaseStatusMirrorRecord,
  type OperationalStatusRecord,
  type StripeBillingOpsReviewRecord,
} from "../../../src/lib/dynamodb/app-data.js";
import {
  createDynamoDbAppDataRepository,
  findPatientByStripePointerDynamoDb,
  getMdiLinkageDynamoDb,
  getStripeLinkageDynamoDb,
  linkStripeCustomerDynamoDb,
  listStripeBillingReconciliationItemsDynamoDb,
  recordEvidenceEventDynamoDb,
  resolveDynamoDbAppDataConfig,
} from "../../../src/lib/dynamodb/app-data-dynamodb.js";
import {
  reconcileStripeMdiBilling,
  type StripeMdiBillingReconciliationGateway,
  type StripeMdiBillingReconciliationRepository,
  type StripeMdiBillingSubscriptionSnapshot,
} from "../../../src/lib/billing-reconciliation.js";
import { getMdiCaseStatus } from "../../../src/lib/mdi/client.js";
import { createStripeClient } from "../../../src/lib/stripe.js";
import {
  resolveRuntimeStage,
  resolveStartupSecretSource,
  validateServerStartupSecrets,
} from "../../../src/lib/secrets/startup.js";

type ScheduledEvent = {
  id?: string;
  time?: string;
};

type LambdaContext = {
  awsRequestId?: string;
};

let testGateway: StripeMdiBillingReconciliationGateway | null = null;
let testRepository: StripeMdiBillingReconciliationRuntimeRepository | null = null;

export function configureStripeMdiBillingReconciliationLambdaForTests(input: {
  gateway?: StripeMdiBillingReconciliationGateway | null;
  repository?: StripeMdiBillingReconciliationRuntimeRepository | null;
}) {
  testGateway = input.gateway ?? null;
  testRepository = input.repository ?? null;
}

export async function handler(event: ScheduledEvent, context: LambdaContext) {
  const stage = requiredEnv("APOTH_STAGE");
  const now = validIsoOrFallback(event.time, new Date().toISOString());
  const requestId = context.awsRequestId ?? event.id ?? "unknown";
  const repository = testRepository ?? createProductionRepository();
  const cursor = await loadCursor(repository);
  const result = await reconcileStripeMdiBilling(
    {
      exclusiveStartKey: cursor.localCursor,
      limit: boundedLimit(process.env.APOTH_STRIPE_MDI_BILLING_RECONCILIATION_LIMIT),
      now,
      stage: stage === "production" ? "production" : "staging",
      stripeCursor: cursor.stripeCursor,
    },
    {
      gateway: testGateway ?? productionGateway(stage),
      repository,
    },
  );

  if (!result.ok) {
    emitMetricLog(stage, result.error.stats);
    console.warn(JSON.stringify({
      event: "stripe_mdi_billing_reconciliation_failed",
      requestId,
      stage,
      code: result.error.code,
      retryable: result.error.retryable,
      stats: result.error.stats,
    }));
    throw new Error(result.error.message);
  }

  await saveCursor(repository, {
    nextKey: result.value.nextKey,
    nextStripeCursor: result.value.nextStripeCursor,
    now,
    requestId,
    scheduledAt: validIsoOrFallback(event.time, now),
    stage,
  });
  emitMetricLog(stage, result.value.stats);
  console.info(JSON.stringify({
    event: "stripe_mdi_billing_reconciliation_completed",
    requestId,
    stage,
    stats: result.value.stats,
  }));
  return {
    ok: true,
    stats: result.value.stats,
  };
}

export type StripeMdiBillingReconciliationRuntimeRepository =
  StripeMdiBillingReconciliationRepository & {
    get(key: AppDataKey):
      | AppDataResult<AppDataRecord | null>
      | Promise<AppDataResult<AppDataRecord | null>>;
    put(
      record: OperationalStatusRecord,
      options?: { ifNotExists?: boolean },
    ): AppDataResult<OperationalStatusRecord> | Promise<AppDataResult<OperationalStatusRecord>>;
    update(
      record: OperationalStatusRecord,
      options?: { expected?: AppDataRecord },
    ): AppDataResult<OperationalStatusRecord> | Promise<AppDataResult<OperationalStatusRecord>>;
  };

function createProductionRepository(): StripeMdiBillingReconciliationRuntimeRepository {
  const config = resolveDynamoDbAppDataConfig(process.env);
  if (!config.ok) {
    throw new Error(config.error.message);
  }

  const repository = createDynamoDbAppDataRepository(config.value);
  return {
    ...repository,
    ...createProductionReconciliationRepository(repository),
  };
}

function createProductionReconciliationRepository(
  repository: ReturnType<typeof createDynamoDbAppDataRepository>,
): StripeMdiBillingReconciliationRepository {
  return {
    findPatientByStripePointer(input) {
      return findPatientByStripePointerDynamoDb(repository, input);
    },
    async getMdiCaseStatusMirror(mdiCaseId) {
      const record = await repository.get(mdiCaseStatusMirrorKey(mdiCaseId));
      if (!record.ok || !record.value) {
        return record as AppDataResult<MdiCaseStatusMirrorRecord | null>;
      }
      if (record.value.recordType !== "mdiCaseStatusMirror") {
        return {
          ok: false,
          error: { kind: "validation_failed", message: "MDI case mirror key contained another record type" },
        };
      }
      return { ok: true, value: record.value };
    },
    getMdiLinkage(cognitoSub) {
      return getMdiLinkageDynamoDb(repository, cognitoSub);
    },
    getStripeLinkage(cognitoSub) {
      return getStripeLinkageDynamoDb(repository, cognitoSub);
    },
    linkStripeCustomer(input) {
      return linkStripeCustomerDynamoDb(repository, input);
    },
    listStripeBillingReconciliationItems(input) {
      return listStripeBillingReconciliationItemsDynamoDb(repository, input);
    },
    recordEvidenceEvent(input) {
      return recordEvidenceEventDynamoDb(repository, input);
    },
    recordStripeBillingOpsReview(input) {
      return recordStripeBillingOpsReviewDynamoDb(repository, input);
    },
  };
}

async function recordStripeBillingOpsReviewDynamoDb(
  repository: Pick<ReturnType<typeof createDynamoDbAppDataRepository>, "get" | "put">,
  input: {
    now: string;
    reason: "unpaired_stripe_subscription";
    stage: "production" | "staging";
    stripeCustomerId: string;
    stripeSubscriptionId: string;
  },
): Promise<AppDataResult<StripeBillingOpsReviewRecord>> {
  const key = stripeBillingOpsReviewKey(input.stripeSubscriptionId);
  const existing = await repository.get(key);
  if (!existing.ok) {
    return existing;
  }
  if (existing.value) {
    if (existing.value.recordType !== "stripeBillingOpsReview") {
      return {
        ok: false,
        error: { kind: "validation_failed", message: "Stripe billing ops-review key contained another record type" },
      };
    }
    return { ok: true, value: existing.value };
  }
  return repository.put({
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
  }, { ifNotExists: true });
}

function productionGateway(stage: string): StripeMdiBillingReconciliationGateway {
  const runtimeStage = stage === "production" ? "production" : "staging";
  const source = resolveStartupSecretSource({
    env: process.env,
    requiredSecrets: ["mdiApi", "stripeApi"],
  });
  let stripePromise: Promise<Stripe | null> | null = null;

  async function stripeClient() {
    if (stripePromise) {
      return stripePromise;
    }
    stripePromise = (async () => {
      if (!source.ok) {
        return null;
      }
      const validated = await validateServerStartupSecrets({
        stage: resolveRuntimeStage(process.env),
        requiredSecrets: ["stripeApi"],
        source: source.value.source,
      });
      if (!validated.ok) {
        return null;
      }
      const secret = validated.value.find((value) => value.secretKind === "stripeApi");
      return secret?.secretKind === "stripeApi" ? createStripeClient(secret) : null;
    })();
    return stripePromise;
  }

  return {
    async getMdiCaseStatus(input) {
      if (!source.ok) {
        return providerUnavailable(source.error.message, false);
      }
      const status = await getMdiCaseStatus(
        { mdiCaseId: input.mdiCaseId },
        {
          secretSource: source.value.source,
          stage: runtimeStage,
          timeoutMs: 5_000,
        },
      );
      return status.ok
        ? status
        : {
          ok: false,
          error: {
            code: status.error.code === "invalid_response" ? "invalid_response" : "provider_unavailable",
            message: status.error.message,
            retryable: status.error.retryable,
            status: status.error.status,
          },
        };
    },
    async getStripeSubscription(input): ReturnType<
      StripeMdiBillingReconciliationGateway["getStripeSubscription"]
    > {
      const stripe = await stripeClient();
      if (!stripe) {
        return providerUnavailable("Stripe secret source is unavailable", false);
      }
      try {
        const subscription = await stripe.subscriptions.retrieve(input.stripeSubscriptionId);
        return { ok: true, value: stripeSubscriptionSnapshot(subscription) };
      } catch (error) {
        return stripeError(error);
      }
    },
    async listRecentStripeSubscriptions(input): ReturnType<
      StripeMdiBillingReconciliationGateway["listRecentStripeSubscriptions"]
    > {
      const stripe = await stripeClient();
      if (!stripe) {
        return providerUnavailable("Stripe secret source is unavailable", false);
      }
      try {
        const page = await stripe.subscriptions.search({
          limit: input.limit ?? 5,
          page: input.cursor,
          query: `metadata['apoth_stage']:'${input.stage}'`,
        });
        return {
          ok: true,
          value: {
            items: page.data.map(stripeSubscriptionSnapshot),
            nextCursor: page.next_page ?? undefined,
          },
        };
      } catch (error) {
        return stripeProviderError(error);
      }
    },
  };
}

function stripeSubscriptionSnapshot(
  subscription: Stripe.Subscription,
): StripeMdiBillingSubscriptionSnapshot {
  return {
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    currentPeriodEnd: timestampToIso(stripeSubscriptionPeriod(subscription, "current_period_end")),
    currentPeriodStart: timestampToIso(stripeSubscriptionPeriod(subscription, "current_period_start")),
    metadata: safeStripeMetadata(subscription.metadata),
    status: subscription.status,
    stripeCustomerId: typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id,
    stripeSubscriptionId: subscription.id,
  };
}

function stripeSubscriptionPeriod(
  subscription: Stripe.Subscription,
  field: "current_period_end" | "current_period_start",
) {
  const value = (subscription as unknown as Record<string, unknown>)[field];
  return typeof value === "number" ? value : undefined;
}

function timestampToIso(value: number | null | undefined) {
  return typeof value === "number" ? new Date(value * 1000).toISOString() : undefined;
}

function safeStripeMetadata(metadata: Stripe.Metadata | null | undefined) {
  const safe: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata ?? {})) {
    if (typeof value === "string" && value.length <= 200) {
      safe[key] = value;
    }
  }
  return safe;
}

function providerUnavailable(message: string, retryable: boolean) {
  return {
    ok: false as const,
    error: {
      code: "provider_unavailable" as const,
      message,
      retryable,
    },
  };
}

function stripeError(error: unknown) {
  const status = typeof error === "object" && error !== null && "statusCode" in error
    ? Number((error as { statusCode?: unknown }).statusCode)
    : undefined;
  if (status === 404) {
    return {
      ok: false as const,
      error: {
        code: "not_found" as const,
        message: "Stripe subscription was not found",
        retryable: false,
        status,
      },
    };
  }
  return {
    ok: false as const,
    error: {
      code: "provider_unavailable" as const,
      message: "Stripe subscription state is unavailable",
      retryable: status === undefined || status >= 500 || status === 429,
      status,
    },
  };
}

function stripeProviderError(error: unknown): {
  ok: false;
  error: {
    code: "provider_unavailable";
    message: string;
    retryable: boolean;
    status?: number;
  };
} {
  const failed = stripeError(error);
  if (failed.error.code === "provider_unavailable") {
    return {
      ok: false,
      error: {
        code: "provider_unavailable",
        message: failed.error.message,
        retryable: failed.error.retryable,
        status: failed.error.status,
      },
    };
  }
  return providerUnavailable("Stripe subscription listing is unavailable", false);
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function validIsoOrFallback(value: string | undefined, fallback: string) {
  if (!value) {
    return fallback;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

function boundedLimit(value: string | undefined) {
  const parsed = value === undefined ? NaN : Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 25 ? parsed : 5;
}

async function loadCursor(
  repository: Pick<StripeMdiBillingReconciliationRuntimeRepository, "get">,
): Promise<{ localCursor?: AppDataKey; stripeCursor?: string }> {
  const record = await repository.get(operationalStatusKey("stripe-mdi-billing-reconciliation"));
  if (
    record.ok &&
    record.value?.recordType === "operationalStatus"
  ) {
    const localCursor = record.value.lastCursorPk === stripeBillingReconciliationIndexPk &&
      typeof record.value.lastCursorSk === "string" &&
      record.value.lastCursorSk.startsWith("SUBSCRIPTION#")
      ? { pk: record.value.lastCursorPk, sk: record.value.lastCursorSk }
      : undefined;
    return {
      localCursor,
      stripeCursor: record.value.lastProviderCursor,
    };
  }
  return {};
}

async function saveCursor(
  repository: Pick<StripeMdiBillingReconciliationRuntimeRepository, "get" | "put" | "update">,
  input: {
    nextKey?: AppDataKey;
    nextStripeCursor?: string;
    now: string;
    requestId: string;
    scheduledAt: string;
    stage: string;
  },
) {
  const key = operationalStatusKey("stripe-mdi-billing-reconciliation");
  const existing = await repository.get(key);
  if (!existing.ok) {
    throw new Error(existing.error.message);
  }

  const record: OperationalStatusRecord = {
    ...key,
    recordType: "operationalStatus",
    schemaVersion: 1,
    createdAt: existing.value?.createdAt ?? input.now,
    jobName: "stripe-mdi-billing-reconciliation",
    lastHeartbeatAt: input.now,
    lastProviderCursor: input.nextStripeCursor,
    lastRequestId: input.requestId,
    lastScheduledAt: input.scheduledAt,
    name: "stripe-mdi-billing-reconciliation",
    stage: input.stage,
    status: "ok",
    updatedAt: input.now,
    ...(input.nextKey ? {
      lastCursorPk: input.nextKey.pk,
      lastCursorSk: input.nextKey.sk,
    } : {}),
  };
  const written = existing.value
    ? await repository.update(record, { expected: existing.value })
    : await repository.put(record, { ifNotExists: true });
  if (!written.ok) {
    throw new Error(written.error.message);
  }
}

function emitMetricLog(
  stage: string,
  input: {
    corrected: number;
    opsReview: number;
    providerUnavailable: number;
    skippedMissingLinkage: number;
    storageFailures: number;
  },
) {
  console.info(JSON.stringify({
    _aws: {
      CloudWatchMetrics: [
        {
          Dimensions: [["Stage", "Provider", "Outcome", "ReasonCode", "RouteGroup"]],
          Metrics: [
            { Name: "StripeMdiBillingReconciliationCorrections", Unit: "Count" },
            { Name: "StripeMdiBillingReconciliationOpsReview", Unit: "Count" },
            { Name: "StripeMdiBillingReconciliationProviderUnavailable", Unit: "Count" },
            { Name: "StripeMdiBillingReconciliationSkippedMissingLinkage", Unit: "Count" },
            { Name: "StripeMdiBillingReconciliationStorageFailures", Unit: "Count" },
          ],
          Namespace: "Apoth/ScheduledJobs",
        },
      ],
      Timestamp: Date.now(),
    },
    Outcome: "recorded",
    Provider: "stripe",
    ReasonCode: "billing_reconciliation",
    RouteGroup: "scheduled",
    Stage: stage,
    StripeMdiBillingReconciliationCorrections: input.corrected,
    StripeMdiBillingReconciliationOpsReview: input.opsReview,
    StripeMdiBillingReconciliationProviderUnavailable: input.providerUnavailable,
    StripeMdiBillingReconciliationSkippedMissingLinkage: input.skippedMissingLinkage,
    StripeMdiBillingReconciliationStorageFailures: input.storageFailures,
    event: "stripe_mdi_billing_reconciliation_metrics",
  }));
}
