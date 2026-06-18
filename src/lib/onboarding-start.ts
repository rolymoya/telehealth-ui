import "server-only";

import { cookies } from "next/headers";
import {
  getServerSession,
  resolveCognitoAuthConfig,
  type AuthTokenVerifier,
  type CognitoAuthConfig,
} from "@/lib/auth";
import { patientAccessCookieName } from "@/lib/auth/session-cookie";
import { currentConsentVersion } from "@/lib/consents";
import {
  createDynamoDbAppDataRepository,
  resolveDynamoDbAppDataConfig,
} from "@/lib/dynamodb/app-data-dynamodb";
import {
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

export type OnboardingStartRepository = AppDataReadRepository & {
  put<T extends AppDataRecord>(
    record: T,
    options?: Parameters<AppDataRepository["put"]>[1],
  ): AppDataResult<T> | Promise<AppDataResult<T>>;
};

export async function resolveOnboardingStartRedirect(input: {
  config?: CognitoAuthConfig;
  consentVersion?: string;
  now?: Date;
  pathname?: string;
  repository?: OnboardingStartRepository;
  token?: string | null;
  verifier?: AuthTokenVerifier;
}): Promise<AppDataResult<{ destination: string }>> {
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
  const profile = await ensurePatientProfile(repository, {
    cognitoSub: session.value.user.cognitoSub,
    now,
  });
  if (!profile.ok) {
    return profile;
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
