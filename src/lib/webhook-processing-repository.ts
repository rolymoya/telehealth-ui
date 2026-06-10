import "server-only";

import {
  type DynamoDbAppDataRepository,
  claimWebhookEventDynamoDb,
  markWebhookEventStatusDynamoDb,
} from "@/lib/dynamodb/app-data-dynamodb";
import {
  type AppDataRepository,
  claimWebhookEvent,
  markWebhookEventStatus,
} from "@/lib/dynamodb/app-data";
import type {
  ClaimedWebhookRecord,
  WebhookClaimState,
  WebhookProcessingRepository,
} from "@/lib/webhooks";

export function createWebhookProcessingRepository(
  repository: AppDataRepository,
): WebhookProcessingRepository {
  return {
    async claim(input) {
      const claimed = claimWebhookEvent(repository, input);
      if (!claimed.ok) {
        if (claimed.error.kind !== "duplicate_webhook_claim") {
          throw new Error(claimed.error.message);
        }
        return {
          outcome: "alreadyProcessing",
          record: fallbackClaimedRecord(input.provider, input.eventId, input.now),
        };
      }
      return {
        outcome: claimed.value.outcome as WebhookClaimState,
        record: claimedRecord(claimed.value.record),
      };
    },
    async markProcessed(input) {
      const marked = markWebhookEventStatus(repository, {
        ...input,
        retryable: false,
        status: "processed",
      });
      if (!marked.ok) {
        throw new Error(marked.error.message);
      }
    },
    async markFailed(input) {
      const marked = markWebhookEventStatus(repository, {
        ...input,
        status: "failed",
      });
      if (!marked.ok) {
        throw new Error(marked.error.message);
      }
    },
  };
}

export function createDynamoDbWebhookProcessingRepository(
  repository: Pick<DynamoDbAppDataRepository, "get" | "put" | "update">,
): WebhookProcessingRepository {
  return {
    async claim(input) {
      const claimed = await claimWebhookEventDynamoDb(repository, input);
      if (!claimed.ok) {
        if (claimed.error.kind !== "duplicate_webhook_claim") {
          throw new Error(claimed.error.message);
        }
        return {
          outcome: "alreadyProcessing",
          record: fallbackClaimedRecord(input.provider, input.eventId, input.now),
        };
      }
      return {
        outcome: claimed.value.outcome as WebhookClaimState,
        record: claimedRecord(claimed.value.record),
      };
    },
    async markProcessed(input) {
      const marked = await markWebhookEventStatusDynamoDb(repository, {
        ...input,
        retryable: false,
        status: "processed",
      });
      if (!marked.ok) {
        throw new Error(marked.error.message);
      }
    },
    async markFailed(input) {
      const marked = await markWebhookEventStatusDynamoDb(repository, {
        ...input,
        status: "failed",
      });
      if (!marked.ok) {
        throw new Error(marked.error.message);
      }
    },
  };
}

function claimedRecord(input: {
  attempts: number;
  eventId: string;
  maxAttempts?: number;
  processingExpiresAt?: string;
  provider: "stripe" | "mdi";
  retryOwner?: "provider" | "queue" | "handoff";
  retryable: boolean;
  status: "processing" | "processed" | "failed";
}): ClaimedWebhookRecord {
  return {
    attempts: input.attempts,
    eventId: input.eventId,
    processingExpiresAt: input.processingExpiresAt,
    provider: input.provider,
    retryOwner: input.retryOwner,
    retryable: input.retryable,
    status: input.status,
  };
}

function fallbackClaimedRecord(
  provider: "stripe" | "mdi",
  eventId: string,
  now: string,
): ClaimedWebhookRecord {
  return {
    attempts: 0,
    eventId,
    processingExpiresAt: now,
    provider,
    retryable: true,
    status: "processing",
  };
}
