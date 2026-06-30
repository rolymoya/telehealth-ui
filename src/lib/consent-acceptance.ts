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
  consentAcknowledgementFieldName,
  currentConsentVersion,
  currentRequiredConsents,
  requiredConsentsBeforeBillingOrPrescribing,
  requiredConsentsBeforeMdi,
  requiredMedicationDisclosureConsents,
  requiredConsentsForCurrentOnboarding,
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
  mdiLinkageKey,
  patientProfileKey,
} from "@/lib/dynamodb/app-data";
import { readTreatmentSelection } from "@/lib/billing-disclosure-gate";
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

export type ConsentAcceptanceGate = "pre_mdi" | "post_questionnaire_medication";

export { consentAcknowledgementFieldName } from "@/lib/consents";

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
  gate?: ConsentAcceptanceGate;
  now?: Date;
  repository?: ConsentAcceptanceRepository;
  token?: string | null;
  verifier?: AuthTokenVerifier;
}): Promise<AppDataResult<{ destination: string }>> {
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
  const gate = await resolveConsentAcceptanceGate(repository, {
    cognitoSub: session.value.user.cognitoSub,
    gate: input.gate ?? "pre_mdi",
  });
  if (!gate.ok) {
    return gate;
  }
  if (gate.value.destination) {
    return { ok: true, value: { destination: gate.value.destination } };
  }

  const acknowledgements = validateCurrentConsentAcknowledgements(
    input.acknowledgements,
    gate.value.requiredConsents,
  );
  if (!acknowledgements.ok) {
    return acknowledgements;
  }

  const now = (input.now ?? new Date()).toISOString();
  const write = await recordConsentAcceptanceForRequiredConsentsAsync(repository, {
    acceptedAt: now,
    cognitoSub: session.value.user.cognitoSub,
    now,
    requiredConsents: gate.value.requiredConsents,
  });
  if (!write.ok) {
    return write;
  }

  const snapshot = await readOnboardingGateSnapshotAsync(repository, {
    cognitoSub: session.value.user.cognitoSub,
    consentVersion: input.consentVersion ?? currentConsentVersion,
    requiredConsents: gate.value.snapshotRequiredConsents,
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

export async function resolveConsentDocumentsForDisplay(input: {
  config?: CognitoAuthConfig;
  gate?: ConsentAcceptanceGate;
  now?: Date;
  repository?: ConsentAcceptanceRepository;
  token?: string | null;
  verifier?: AuthTokenVerifier;
} = {}): Promise<AppDataResult<{
  gate: ConsentAcceptanceGate;
  requiredConsents: readonly RequiredConsentDocument[];
}>> {
  const gate = input.gate ?? "pre_mdi";
  if (gate === "pre_mdi") {
    return {
      ok: true,
      value: {
        gate,
        requiredConsents: requiredConsentsBeforeMdi(),
      },
    };
  }

  const token = input.token === undefined
    ? await readAccessCookie()
    : input.token;
  if (!token) {
    return {
      ok: true,
      value: { gate, requiredConsents: [] },
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
      value: { gate, requiredConsents: [] },
    };
  }

  const repository = input.repository ?? createConsentAcceptanceRepository();
  const resolved = await resolveConsentAcceptanceGate(repository, {
    cognitoSub: session.value.user.cognitoSub,
    gate,
  });
  if (!resolved.ok) {
    return resolved;
  }

  return {
    ok: true,
    value: {
      gate,
      requiredConsents: resolved.value.requiredConsents,
    },
  };
}

async function resolveConsentAcceptanceGate(
  repository: ConsentAcceptanceRepository,
  input: {
    cognitoSub: string;
    gate: ConsentAcceptanceGate;
  },
): Promise<AppDataResult<{
  destination?: string;
  requiredConsents: readonly RequiredConsentDocument[];
  snapshotRequiredConsents: readonly RequiredConsentDocument[];
}>> {
  if (input.gate === "pre_mdi") {
    const requiredConsents = requiredConsentsBeforeMdi();
    return {
      ok: true,
      value: {
        requiredConsents,
        snapshotRequiredConsents: requiredConsents,
      },
    };
  }

  const profile = await repository.get(patientProfileKey(input.cognitoSub));
  if (!profile.ok) {
    return profile;
  }
  if (profile.value && profile.value.recordType !== "patientProfile") {
    return appDataErr("Patient profile key contains another record type");
  }
  if (
    !profile.value ||
    (
      profile.value.onboardingStatus !== "mdi_submitted" &&
      profile.value.onboardingStatus !== "clinical_review" &&
      profile.value.onboardingStatus !== "billing_ready"
    )
  ) {
    return { ok: true, value: recoveryGate("/onboarding/mdi") };
  }

  const linkage = await repository.get(mdiLinkageKey(input.cognitoSub));
  if (!linkage.ok) {
    return linkage;
  }
  if (linkage.value && linkage.value.recordType !== "mdiLinkage") {
    return appDataErr("MDI linkage key contains another record type");
  }
  if (!linkage.value?.mdiPatientId || !linkage.value.mdiCaseId) {
    return { ok: true, value: recoveryGate("/onboarding/mdi") };
  }

  const selection = await readTreatmentSelection(repository, input.cognitoSub);
  if (!selection.ok) {
    return selection;
  }
  if (!selection.value) {
    return { ok: true, value: recoveryGate("/onboarding/mdi") };
  }

  const requiredConsents = requiredMedicationDisclosureConsents({
    treatment: selection.value.treatment,
  });
  return {
    ok: true,
    value: {
      requiredConsents,
      snapshotRequiredConsents: requiredConsentsBeforeBillingOrPrescribing({
        treatment: selection.value.treatment,
      }),
    },
  };
}

function recoveryGate(destination: string) {
  return {
    destination,
    requiredConsents: [] as const,
    snapshotRequiredConsents: [] as const,
  };
}

export async function recordConsentAcceptanceForRequiredConsentsAsync(
  repository: ConsentAcceptanceRepository,
  input: {
    acceptedAt: string;
    cognitoSub: string;
    now: string;
    requiredConsents: readonly RequiredConsentDocument[];
  },
): Promise<AppDataResult<ConsentEvidenceRecord[]>> {
  const requiredConsents = input.requiredConsents;
  const records = requiredConsents.map((consent) => createConsentEvidenceRecord({
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

  return readCurrentConsentEvidenceRecords(repository, {
    cognitoSub: input.cognitoSub,
    requiredConsents,
  });
}

async function readCurrentConsentEvidenceRecords(
  repository: ConsentAcceptanceRepository,
  input: {
    cognitoSub: string;
    requiredConsents?: readonly RequiredConsentDocument[];
  },
): Promise<AppDataResult<ConsentEvidenceRecord[]>> {
  const records: ConsentEvidenceRecord[] = [];
  const requiredConsents = input.requiredConsents ?? requiredConsentsForCurrentOnboarding();

  for (const consent of requiredConsents) {
    const existing = await repository.get(consentEvidenceKey(
      input.cognitoSub,
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

function appDataErr(message: string): AppDataResult<never> {
  return {
    ok: false,
    error: { kind: "validation_failed", message },
  };
}
