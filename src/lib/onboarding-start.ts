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
  requiredConsentsBeforeMdi,
  requiredConsentsForCurrentOnboarding,
} from "@/lib/consents";
import {
  createDynamoDbAppDataRepository,
  resolveDynamoDbAppDataConfig,
} from "@/lib/dynamodb/app-data-dynamodb";
import {
  anonymousPrecheckConsumptionKey,
  createAnonymousPrecheckConsumptionRecord,
  createPatientProfileRecord,
  patientProfileKey,
  type AppDataRecord,
  type AppDataRepository,
  type AppDataResult,
  type PatientProfileRecord,
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
import {
  anonymousPrecheckNonceHash,
  type AnonymousPrecheckContextPayload,
} from "../../shared/intake/anonymous-precheck-context";

export type OnboardingStartRepository = AppDataReadRepository & {
  put<T extends AppDataRecord>(
    record: T,
    options?: Parameters<AppDataRepository["put"]>[1],
  ): AppDataResult<T> | Promise<AppDataResult<T>>;
  update<T extends AppDataRecord>(
    record: T,
    options?: Parameters<AppDataRepository["update"]>[1],
  ): AppDataResult<T> | Promise<AppDataResult<T>>;
  transactWrite(
    operations: Parameters<AppDataRepository["transactWrite"]>[0],
  ): AppDataResult<void> | Promise<AppDataResult<void>>;
};

export async function resolveOnboardingStartRedirect(input: {
  anonymousPrecheckContext?: AnonymousPrecheckContextPayload;
  config?: CognitoAuthConfig;
  consentVersion?: string;
  now?: Date;
  pathname?: string;
  repository?: OnboardingStartRepository;
  token?: string | null;
  verifier?: AuthTokenVerifier;
}): Promise<AppDataResult<{
  clearAnonymousPrecheckContext?: boolean;
  destination: string;
}>> {
  const pathname = input.pathname ?? "/get-started";
  const token = input.token === undefined
    ? await readAccessCookie()
    : input.token;

  if (!token) {
    return {
      ok: true,
      value: { destination: signInRedirectFor(pathname) },
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
      value: { destination: signInRedirectFor(pathname) },
    };
  }

  const repository = input.repository ?? createOnboardingStartRepository();
  const now = (input.now ?? new Date()).toISOString();

  const bind = input.anonymousPrecheckContext
    ? await bindAnonymousPrecheckContext(repository, {
        cognitoSub: session.value.user.cognitoSub,
        context: input.anonymousPrecheckContext,
        now,
      })
    : null;
  if (bind && !bind.ok) {
    return bind;
  }

  if (!input.anonymousPrecheckContext) {
    const profile = await ensurePatientProfile(repository, {
      cognitoSub: session.value.user.cognitoSub,
      now,
    });
    if (!profile.ok) {
      return profile;
    }
  }

  const snapshot = await readOnboardingGateSnapshotAsync(repository, {
    cognitoSub: session.value.user.cognitoSub,
    consentVersion: input.consentVersion ?? currentConsentVersion,
    requiredConsents: requiredConsentsBeforeMdi(),
  });
  if (!snapshot.ok) {
    return snapshot;
  }

  const preBillingDestination = onboardingRouteForStep(
    earliestIncompleteOnboardingStep(snapshot.value),
  );
  const gatedDestination = await destinationWithBillingConsentGate(repository, {
    cognitoSub: session.value.user.cognitoSub,
    consentVersion: input.consentVersion ?? currentConsentVersion,
    destination: preBillingDestination,
  });
  if (!gatedDestination.ok) {
    return gatedDestination;
  }
  const destination = bind?.ok && bind.value.recoverAtIntake &&
      gatedDestination.value !== "/onboarding/consent"
    ? "/intake"
    : gatedDestination.value;

  return {
    ok: true,
    value: {
      ...(input.anonymousPrecheckContext
        ? { clearAnonymousPrecheckContext: true }
        : {}),
      destination,
    },
  };
}

async function destinationWithBillingConsentGate(
  repository: AppDataReadRepository,
  input: {
    cognitoSub: string;
    consentVersion: string;
    destination: string;
  },
): Promise<AppDataResult<string>> {
  if (input.destination !== "/billing" && input.destination !== "/dashboard") {
    return { ok: true, value: input.destination };
  }

  const snapshot = await readOnboardingGateSnapshotAsync(repository, {
    cognitoSub: input.cognitoSub,
    consentVersion: input.consentVersion,
    requiredConsents: requiredConsentsForCurrentOnboarding(),
  });
  if (!snapshot.ok) {
    return snapshot;
  }

  return {
    ok: true,
    value: onboardingRouteForStep(
      earliestIncompleteOnboardingStep(snapshot.value),
    ),
  };
}

export async function bindAnonymousPrecheckContext(
  repository: OnboardingStartRepository,
  input: {
    cognitoSub: string;
    context: AnonymousPrecheckContextPayload;
    now: string;
  },
): Promise<AppDataResult<{ recoverAtIntake?: boolean }>> {
  const nonceHash = anonymousPrecheckNonceHash(input.context);
  const residencyState = input.context.residencyState as NonNullable<
    PatientProfileRecord["residencyState"]
  >;
  const consumed = await repository.get(anonymousPrecheckConsumptionKey(nonceHash));
  if (!consumed.ok) {
    return consumed;
  }

  const existingProfile = await repository.get(patientProfileKey(input.cognitoSub));
  if (!existingProfile.ok) {
    return existingProfile;
  }
  const profile = validateProfileRecord(existingProfile.value);
  if (existingProfile.value && !profile) {
    return appDataErr("validation_failed", "Patient profile key contains another record type");
  }

  if (consumed.value) {
    if (consumed.value.recordType !== "anonymousPrecheckConsumption") {
      return appDataErr(
        "validation_failed",
        "Anonymous precheck consumption key contains another record type",
      );
    }
    if (consumed.value.cognitoSub !== input.cognitoSub) {
      return { ok: true, value: { recoverAtIntake: true } };
    }
    return isSameAccountReplayRecovered(profile?.value ?? null, input.context.residencyState)
      ? { ok: true, value: {} }
      : { ok: true, value: { recoverAtIntake: true } };
  }

  const consumption = createAnonymousPrecheckConsumptionRecord({
    cognitoSub: input.cognitoSub,
    consumedAt: input.now,
    expiresAt: input.context.expiresAt,
    nonceHash,
  });

  if (!profile) {
    const next = createPatientProfileRecord({
      cognitoSub: input.cognitoSub,
      now: input.now,
      onboardingStatus: "intake_ready",
      residencyState,
    });
    return bindWithTransaction(repository, [
      { type: "put", record: next, ifNotExists: true },
      { type: "put", record: consumption, ifNotExists: true },
    ], input);
  }

  if (profile.value.onboardingStatus === "profile_pending") {
    const next: PatientProfileRecord = {
      ...profile.value,
      onboardingStatus: "intake_ready",
      residencyState,
      updatedAt: input.now,
    };
    return bindWithTransaction(repository, [
      { type: "update", record: next, expected: profile.value },
      { type: "put", record: consumption, ifNotExists: true },
    ], input);
  }

  if (
    profile.value.onboardingStatus === "intake_ready" &&
    (!profile.value.residencyState || profile.value.residencyState === residencyState)
  ) {
    const operations: Parameters<AppDataRepository["transactWrite"]>[0] = [
      { type: "put", record: consumption, ifNotExists: true },
    ];
    if (!profile.value.residencyState) {
      operations.unshift({
        type: "update",
        expected: profile.value,
        record: {
          ...profile.value,
          residencyState,
          updatedAt: input.now,
        },
      });
    }
    return bindWithTransaction(repository, operations, input);
  }

  const consumedOnly = await repository.put(consumption, { ifNotExists: true });
  if (consumedOnly.ok) {
    return {
      ok: true,
      value: profile.value.onboardingStatus === "intake_ready"
        ? { recoverAtIntake: true }
        : {},
    };
  }
  return consumedOnly.error.kind === "conditional_conflict"
    ? recoverAfterConsumptionConflict(repository, input)
    : consumedOnly;
}

export async function ensurePatientProfile(
  repository: OnboardingStartRepository,
  input: { cognitoSub: string; now: string },
): Promise<AppDataResult<PatientProfileRecord>> {
  const existing = await repository.get(patientProfileKey(input.cognitoSub));
  if (!existing.ok) {
    return existing;
  }
  const profile = validateProfileRecord(existing.value);
  if (profile) {
    return profile;
  }
  if (existing.value) {
    return appDataErr("validation_failed", "Patient profile key contains another record type");
  }

  const created = createPatientProfileRecord({
    cognitoSub: input.cognitoSub,
    onboardingStatus: "profile_pending",
    now: input.now,
  });
  const put = await repository.put(created, { ifNotExists: true });
  if (put.ok) {
    return put;
  }
  if (put.error.kind !== "conditional_conflict") {
    return put;
  }

  const reread = await repository.get(patientProfileKey(input.cognitoSub));
  if (!reread.ok) {
    return reread;
  }
  const rereadProfile = validateProfileRecord(reread.value);
  if (rereadProfile) {
    return rereadProfile;
  }

  return appDataErr(
    "conditional_conflict",
    "Patient profile create conflicted but no profile could be read",
  );
}

async function bindWithTransaction(
  repository: OnboardingStartRepository,
  operations: Parameters<AppDataRepository["transactWrite"]>[0],
  input: {
    cognitoSub: string;
    context: AnonymousPrecheckContextPayload;
  },
): Promise<AppDataResult<{ recoverAtIntake?: boolean }>> {
  const written = await repository.transactWrite(operations);
  if (written.ok) {
    return { ok: true, value: {} };
  }
  return written.error.kind === "conditional_conflict"
    ? recoverAfterConsumptionConflict(repository, input)
    : written;
}

async function recoverAfterConsumptionConflict(
  repository: OnboardingStartRepository,
  input: {
    cognitoSub: string;
    context: AnonymousPrecheckContextPayload;
  },
): Promise<AppDataResult<{ recoverAtIntake?: boolean }>> {
  const consumed = await repository.get(
    anonymousPrecheckConsumptionKey(anonymousPrecheckNonceHash(input.context)),
  );
  if (!consumed.ok) {
    return consumed;
  }
  if (!consumed.value || consumed.value.recordType !== "anonymousPrecheckConsumption") {
    return appDataErr(
      "conditional_conflict",
      "Anonymous precheck consumption write conflicted before it was readable",
    );
  }
  if (consumed.value.cognitoSub !== input.cognitoSub) {
    return { ok: true, value: { recoverAtIntake: true } };
  }

  const profile = await repository.get(patientProfileKey(input.cognitoSub));
  if (!profile.ok) {
    return profile;
  }
  const profileRecord = validateProfileRecord(profile.value);
  if (profile.value && !profileRecord) {
    return appDataErr("validation_failed", "Patient profile key contains another record type");
  }

  return isSameAccountReplayRecovered(
      profileRecord?.value ?? null,
      input.context.residencyState,
    )
    ? { ok: true, value: {} }
    : { ok: true, value: { recoverAtIntake: true } };
}

function isSameAccountReplayRecovered(
  profile: PatientProfileRecord | null,
  residencyState: string,
) {
  if (!profile) {
    return false;
  }
  if (profile.onboardingStatus === "intake_ready") {
    return profile.residencyState === residencyState;
  }
  return profile.onboardingStatus !== "profile_pending";
}

export function createOnboardingStartRepository(
  env: Record<string, string | undefined> = process.env,
  options?: Parameters<typeof createDynamoDbAppDataRepository>[1],
): OnboardingStartRepository {
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

function validateProfileRecord(record: AppDataRecord | null) {
  if (!record) {
    return null;
  }
  return record.recordType === "patientProfile"
    ? { ok: true as const, value: record }
    : null;
}

function appDataErr(
  kind: "validation_failed" | "conditional_conflict",
  message: string,
): AppDataResult<never> {
  return { ok: false, error: { kind, message } };
}
