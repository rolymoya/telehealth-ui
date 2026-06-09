import {
  consentEvidenceKey,
  mdiLinkageKey,
  patientProfileKey,
  stripeLinkageKey,
  type AppDataRecord,
  type AppDataRepository,
  type AppDataResult,
} from "@/lib/dynamodb/app-data";
import { type OnboardingGateSnapshot } from "@/lib/onboarding-gates";

export type AppDataReadRepository = {
  get(key: Parameters<AppDataRepository["get"]>[0]):
    | AppDataResult<AppDataRecord | null>
    | Promise<AppDataResult<AppDataRecord | null>>;
};

export function readOnboardingGateSnapshot(
  repository: AppDataRepository,
  input: {
    cognitoSub: string;
    consentVersion: string;
  },
): AppDataResult<OnboardingGateSnapshot> {
  const profile = repository.get(patientProfileKey(input.cognitoSub));
  if (!profile.ok) {
    return profile;
  }
  if (profile.value && profile.value.recordType !== "patientProfile") {
    return appDataErr("validation_failed", "Patient profile key contains another record type");
  }

  const consent = repository.get(consentEvidenceKey(input.cognitoSub, input.consentVersion));
  if (!consent.ok) {
    return consent;
  }
  if (consent.value && consent.value.recordType !== "consentEvidence") {
    return appDataErr("validation_failed", "Consent key contains another record type");
  }

  const mdi = repository.get(mdiLinkageKey(input.cognitoSub));
  if (!mdi.ok) {
    return mdi;
  }
  if (mdi.value && mdi.value.recordType !== "mdiLinkage") {
    return appDataErr("validation_failed", "MDI linkage key contains another record type");
  }

  const stripe = repository.get(stripeLinkageKey(input.cognitoSub));
  if (!stripe.ok) {
    return stripe;
  }
  if (stripe.value && stripe.value.recordType !== "stripeLinkage") {
    return appDataErr("validation_failed", "Stripe linkage key contains another record type");
  }

  return {
    ok: true,
    value: {
      consentAccepted: Boolean(consent.value),
      ...(profile.value ? { onboardingStatus: profile.value.onboardingStatus } : {}),
      ...(mdi.value
        ? {
            mdiPatientId: mdi.value.mdiPatientId,
            ...(mdi.value.mdiCaseId ? { mdiCaseId: mdi.value.mdiCaseId } : {}),
          }
        : {}),
      ...(stripe.value ? { billingStatus: stripe.value.billingStatus } : {}),
    },
  };
}

export async function readOnboardingGateSnapshotAsync(
  repository: AppDataReadRepository,
  input: {
    cognitoSub: string;
    consentVersion: string;
  },
): Promise<AppDataResult<OnboardingGateSnapshot>> {
  const profile = await repository.get(patientProfileKey(input.cognitoSub));
  if (!profile.ok) {
    return profile;
  }
  if (profile.value && profile.value.recordType !== "patientProfile") {
    return appDataErr("validation_failed", "Patient profile key contains another record type");
  }

  const consent = await repository.get(consentEvidenceKey(input.cognitoSub, input.consentVersion));
  if (!consent.ok) {
    return consent;
  }
  if (consent.value && consent.value.recordType !== "consentEvidence") {
    return appDataErr("validation_failed", "Consent key contains another record type");
  }

  const mdi = await repository.get(mdiLinkageKey(input.cognitoSub));
  if (!mdi.ok) {
    return mdi;
  }
  if (mdi.value && mdi.value.recordType !== "mdiLinkage") {
    return appDataErr("validation_failed", "MDI linkage key contains another record type");
  }

  const stripe = await repository.get(stripeLinkageKey(input.cognitoSub));
  if (!stripe.ok) {
    return stripe;
  }
  if (stripe.value && stripe.value.recordType !== "stripeLinkage") {
    return appDataErr("validation_failed", "Stripe linkage key contains another record type");
  }

  return {
    ok: true,
    value: {
      consentAccepted: Boolean(consent.value),
      ...(profile.value ? { onboardingStatus: profile.value.onboardingStatus } : {}),
      ...(mdi.value
        ? {
            mdiPatientId: mdi.value.mdiPatientId,
            ...(mdi.value.mdiCaseId ? { mdiCaseId: mdi.value.mdiCaseId } : {}),
          }
        : {}),
      ...(stripe.value ? { billingStatus: stripe.value.billingStatus } : {}),
    },
  };
}

function appDataErr(
  kind: "validation_failed",
  message: string,
): AppDataResult<never> {
  return { ok: false, error: { kind, message } };
}
