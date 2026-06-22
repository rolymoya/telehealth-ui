import {
  operationalStatusKey,
  type AppDataKey,
  type OperationalStatusRecord,
} from "../../../src/lib/dynamodb/app-data.js";
import {
  createDynamoDbAppDataRepository,
  listMdiCaseStatusReconciliationItemsDynamoDb,
  recordCurrentMdiCaseStatusEvidenceDynamoDb,
  resolveDynamoDbAppDataConfig,
  transitionOnboardingStatusDynamoDb,
} from "../../../src/lib/dynamodb/app-data-dynamodb.js";
import {
  reconcileMdiCaseStatuses,
  type MdiCaseStatusReconciliationGateway,
} from "../../../src/lib/mdi-case-reconciliation.js";
import { getMdiCaseStatus } from "../../../src/lib/mdi/client.js";
import {
  createAwsSecretsManagerStartupSecretSource,
  resolveAwsSecretsManagerStartupConfig,
} from "../../../src/lib/secrets/startup.js";

type ScheduledEvent = {
  id?: string;
  time?: string;
};

type LambdaContext = {
  awsRequestId?: string;
};

let testGateway: MdiCaseStatusReconciliationGateway | null = null;

export function configureMdiCaseReconciliationLambdaForTests(input: {
  gateway?: MdiCaseStatusReconciliationGateway | null;
}) {
  testGateway = input.gateway ?? null;
}

export async function handler(event: ScheduledEvent, context: LambdaContext) {
  const stage = requiredEnv("APOTH_STAGE");
  const now = validIsoOrFallback(event.time, new Date().toISOString());
  const config = resolveDynamoDbAppDataConfig(process.env);
  if (!config.ok) {
    throw new Error(config.error.message);
  }

  const repository = createDynamoDbAppDataRepository(config.value);
  const cursor = await loadCursor(repository);
  const result = await reconcileMdiCaseStatuses(
    {
      exclusiveStartKey: cursor,
      limit: boundedLimit(process.env.APOTH_MDI_CASE_RECONCILIATION_LIMIT),
      now,
    },
    {
      gateway: testGateway ?? productionGateway(stage),
      repository: {
        listCaseStatusReconciliationItems(input) {
          return listMdiCaseStatusReconciliationItemsDynamoDb(repository, input);
        },
        recordCurrentCaseStatusEvidence(input) {
          return recordCurrentMdiCaseStatusEvidenceDynamoDb(repository, input);
        },
        transitionOnboardingStatus(input) {
          return transitionOnboardingStatusDynamoDb(repository, input);
        },
      },
    },
  );

  if (!result.ok) {
    emitMetricLog(stage, {
      corrected: result.error.stats.corrected,
      invalidResponse: result.error.stats.invalidResponse,
      providerUnavailable: result.error.stats.providerUnavailable,
      skippedStale: result.error.stats.skippedStale,
    });
    console.warn(JSON.stringify({
      event: "mdi_case_reconciliation_failed",
      requestId: context.awsRequestId ?? event.id ?? "unknown",
      stage,
      code: result.error.code,
      retryable: result.error.retryable,
      stats: result.error.stats,
    }));
    throw new Error(result.error.message);
  }

  await saveCursor(repository, {
    nextKey: result.value.nextKey,
    now,
    requestId: context.awsRequestId ?? event.id ?? "unknown",
    scheduledAt: validIsoOrFallback(event.time, now),
    stage,
  });
  emitMetricLog(stage, {
    corrected: result.value.stats.corrected,
    invalidResponse: result.value.stats.invalidResponse,
    providerUnavailable: result.value.stats.providerUnavailable,
    skippedStale: result.value.stats.skippedStale,
  });
  console.info(JSON.stringify({
    event: "mdi_case_reconciliation_completed",
    requestId: context.awsRequestId ?? event.id ?? "unknown",
    stage,
    stats: result.value.stats,
  }));
  return {
    ok: true,
    stats: result.value.stats,
  };
}

function productionGateway(stage: string): MdiCaseStatusReconciliationGateway {
  const secretConfig = resolveAwsSecretsManagerStartupConfig(process.env, ["mdiApi"]);
  const secretSource = secretConfig.ok
    ? createAwsSecretsManagerStartupSecretSource(secretConfig.value)
    : null;
  const secretErrorMessage = secretConfig.ok ? null : secretConfig.error.message;
  return {
    async getCaseStatus(input) {
      if (!secretSource) {
        return {
          ok: false,
          error: {
            code: "provider_unavailable",
            message: secretErrorMessage ?? "MDI secret source is unavailable",
            retryable: false,
          },
        };
      }

      const status = await getMdiCaseStatus(
        { mdiCaseId: input.mdiCaseId },
        {
          secretSource,
          stage: stage === "production" ? "production" : "staging",
          timeoutMs: 5_000,
        },
      );
      if (status.ok) {
        return status;
      }
      return {
        ok: false,
        error: {
          code: status.error.code === "invalid_response" ? "invalid_response" : "provider_unavailable",
          message: status.error.message,
          retryable: status.error.retryable,
          status: status.error.status,
        },
      };
    },
  };
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
  repository: ReturnType<typeof createDynamoDbAppDataRepository>,
): Promise<AppDataKey | undefined> {
  const record = await repository.get(operationalStatusKey("mdi-case-reconciliation"));
  if (
    record.ok &&
    record.value?.recordType === "operationalStatus" &&
    record.value.lastCursorPk === "MDI#CASE_STATUS_RECONCILIATION#ACTIVE" &&
    typeof record.value.lastCursorSk === "string" &&
    record.value.lastCursorSk.startsWith("CASE#")
  ) {
    return { pk: record.value.lastCursorPk, sk: record.value.lastCursorSk };
  }
  return undefined;
}

async function saveCursor(
  repository: ReturnType<typeof createDynamoDbAppDataRepository>,
  input: {
    nextKey?: AppDataKey;
    now: string;
    requestId: string;
    scheduledAt: string;
    stage: string;
  },
) {
  const key = operationalStatusKey("mdi-case-reconciliation");
  const existing = await repository.get(key);
  if (!existing.ok) {
    throw new Error(existing.error.message);
  }

  const record: OperationalStatusRecord = {
    ...key,
    recordType: "operationalStatus",
    schemaVersion: 1,
    createdAt: existing.value?.createdAt ?? input.now,
    jobName: "mdi-case-reconciliation",
    lastHeartbeatAt: input.now,
    lastRequestId: input.requestId,
    lastScheduledAt: input.scheduledAt,
    name: "mdi-case-reconciliation",
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
    invalidResponse: number;
    providerUnavailable: number;
    skippedStale: number;
  },
) {
  console.info(JSON.stringify({
    _aws: {
      CloudWatchMetrics: [
        {
          Dimensions: [["Stage", "Provider", "Outcome", "ReasonCode", "RouteGroup"]],
          Metrics: [
            { Name: "MdiCaseReconciliationCorrections", Unit: "Count" },
            { Name: "MdiCaseReconciliationInvalidResponses", Unit: "Count" },
            { Name: "MdiCaseReconciliationProviderUnavailable", Unit: "Count" },
            { Name: "MdiCaseReconciliationSkippedStale", Unit: "Count" },
          ],
          Namespace: "Apoth/ScheduledJobs",
        },
      ],
      Timestamp: Date.now(),
    },
    MdiCaseReconciliationCorrections: input.corrected,
    MdiCaseReconciliationInvalidResponses: input.invalidResponse,
    MdiCaseReconciliationProviderUnavailable: input.providerUnavailable,
    MdiCaseReconciliationSkippedStale: input.skippedStale,
    Outcome: "recorded",
    Provider: "mdi",
    ReasonCode: "case_status_reconciliation",
    RouteGroup: "scheduled",
    Stage: stage,
    event: "mdi_case_reconciliation_metrics",
  }));
}
