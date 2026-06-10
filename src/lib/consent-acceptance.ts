import "server-only";

import { cookies } from "next/headers";
import {
  getServerSession,
  resolveCognitoAuthConfig,
  type AuthTokenVerifier,
  type CognitoAuthConfig,
} from "@/lib/auth";
import { patientAccessCookieName } from "@/lib/auth/session-cookie";
import {
  currentConsentVersion,
  currentRequiredConsents,
  type RequiredConsentDocument,
} from "@/lib/consents";
import {
  createDynamoDbAppDataRepository,
  resolveDynamoDbAppDataConfig,
} from "@/lib/dynamodb/app-data-dynamodb";
import type {
  AppDataRepository,
  AppDataResult,
  ConsentEvidenceRecord,
  TransactWriteOperation,
} from "@/lib/dynamodb/app-data";
import {
  consentEvidenceKey,
  createConsentEvidenceRecord,
} from "@/lib/dynamodb/app-data";
import {
  earliestIncompleteOnboardingStep,
  onboardingRouteForStep,
  signInRedirectFor,
} from "@/lib/onboarding-gates";
import {
  readOnboardingGateSnapshotAsync,
  type AppDataReadRepository,
} from "@/lib/onboarding-status";

export type ConsentAcceptanceRepository = AppDataReadRepository & {
  transactWrite(
    operations: Parameters<AppDataRepository["transactWrite"]>[0],
  ): AppDataResult<void> | Promise<AppDataResult<void>>;
};

export type ConsentAcknowledgementInput =
  | FormData
  | Record<string, FormDataEntryValue | boolean | undefined>;

export function consentAcknowledgementFieldName(
  consent: RequiredConsentDocument,
) {
  return `consent:${consent.consentKind}:${consent.version}`;
}

export function validateCurrentConsentAcknowledgements(
  acknowledgements: ConsentAcknowledgementInput,
  requiredConsents: readonly RequiredConsentDocument[] = currentRequiredConsents,
): AppDataResult<void> {
  for (const consent of requiredConsents) {
    const value = acknowledgementValue(
      acknowledgements,
      consentAcknowledgementFieldName(consent),
    );
    if (value !== "accepted" && value !== true) {
      return {
        ok: false,
        error: {
          kind: "validation_failed",
          message: "Required consent acknowledgement was missing",
        },
      };
    }
  }

  return { ok: true, value: undefined };
}

export async function acceptCurrentConsents(input: {
  acknowledgements: ConsentAcknowledgementInput;
  config?: CognitoAuthConfig;
  consentVersion?: string;
  now?: Date;
  repository?: ConsentAcceptanceRepository;
  token?: string | null;
  verifier?: AuthTokenVerifier;
}): Promise<AppDataResult<{ destination: string }>> {
  const acknowledgements = validateCurrentConsentAcknowledgements(input.acknowledgements);
  if (!acknowledgements.ok) {
    return acknowledgements;
  }

  const token = input.token === undefined
    ? await readAccessCookie()
    : input.token;
  if (!token) {
    return {
      ok: true,
      value: { destination: signInRedirectFor("/onboarding/consent") },
    };
  }

  const config = input.config ?? requireCognitoAuthConfig();
  const session = await getServerSession({
    config,
    now: input.now,
    token,
    verifier: input.verifier,
  });
  if (!session.ok) {
    return {
      ok: true,
      value: { destination: signInRedirectFor("/onboarding/consent") },
    };
  }

  const repository = input.repository ?? createConsentAcceptanceRepository();
  const now = (input.now ?? new Date()).toISOString();
  const write = await recordCurrentConsentAcceptanceAsync(repository, {
    acceptedAt: now,
    cognitoSub: session.value.user.cognitoSub,
    now,
  });
  if (!write.ok) {
    return write;
  }

  const snapshot = await readOnboardingGateSnapshotAsync(repository, {
    cognitoSub: session.value.user.cognitoSub,
    consentVersion: input.consentVersion ?? currentConsentVersion,
  });
  if (!snapshot.ok) {
    return snapshot;
  }

  return {
    ok: true,
    value: {
      destination: onboardingRouteForStep(
        earliestIncompleteOnboardingStep(snapshot.value),
      ),
    },
  };
}

async function recordCurrentConsentAcceptanceAsync(
  repository: ConsentAcceptanceRepository,
  input: {
    acceptedAt: string;
    cognitoSub: string;
    now: string;
  },
): Promise<AppDataResult<ConsentEvidenceRecord[]>> {
  const records = currentRequiredConsents.map((consent) => createConsentEvidenceRecord({
    acceptedAt: input.acceptedAt,
    cognitoSub: input.cognitoSub,
    consentKind: consent.consentKind,
    now: input.now,
    version: consent.version,
  }));
  const writes: TransactWriteOperation[] = [];
  const acceptedRecords: ConsentEvidenceRecord[] = [];

  for (const record of records) {
    const existing = await repository.get(record);
    if (!existing.ok) {
      return existing;
    }
    if (existing.value) {
      if (existing.value.recordType !== "consentEvidence") {
        return {
          ok: false,
          error: {
            kind: "validation_failed",
            message: "Consent key contains another record type",
          },
        };
      }
      acceptedRecords.push(existing.value);
      continue;
    }

    writes.push({ type: "put", record, ifNotExists: true });
    acceptedRecords.push(record);
  }

  if (writes.length === 0) {
    return { ok: true, value: acceptedRecords };
  }

  const result = await repository.transactWrite(writes);
  if (result.ok) {
    return { ok: true, value: acceptedRecords };
  }

  if (result.error.kind !== "conditional_conflict") {
    return result;
  }

  return readCurrentConsentEvidenceRecords(repository, input.cognitoSub);
}

async function readCurrentConsentEvidenceRecords(
  repository: ConsentAcceptanceRepository,
  cognitoSub: string,
): Promise<AppDataResult<ConsentEvidenceRecord[]>> {
  const records: ConsentEvidenceRecord[] = [];

  for (const consent of currentRequiredConsents) {
    const existing = await repository.get(consentEvidenceKey(
      cognitoSub,
      consent.consentKind,
      consent.version,
    ));
    if (!existing.ok) {
      return existing;
    }
    if (!existing.value || existing.value.recordType !== "consentEvidence") {
      return {
        ok: false,
        error: {
          kind: "conditional_conflict",
          message: "Consent evidence write conflicted before all current records existed",
        },
      };
    }
    records.push(existing.value);
  }

  return { ok: true, value: records };
}

export function createConsentAcceptanceRepository(
  env: Record<string, string | undefined> = process.env,
  options?: Parameters<typeof createDynamoDbAppDataRepository>[1],
): ConsentAcceptanceRepository {
  const config = resolveDynamoDbAppDataConfig(env);
  if (!config.ok) {
    throw new Error("DynamoDB app-data configuration is unavailable");
  }
  return createDynamoDbAppDataRepository(config.value, options);
}

async function readAccessCookie() {
  const cookieStore = await cookies();
  return cookieStore.get(patientAccessCookieName)?.value ?? null;
}

function requireCognitoAuthConfig() {
  const config = resolveCognitoAuthConfig(process.env);
  if (!config.ok) {
    throw new Error("Cognito auth configuration is unavailable");
  }
  return config.value;
}

function acknowledgementValue(
  acknowledgements: ConsentAcknowledgementInput,
  fieldName: string,
) {
  if (acknowledgements instanceof FormData) {
    return acknowledgements.get(fieldName);
  }

  return acknowledgements[fieldName];
}
