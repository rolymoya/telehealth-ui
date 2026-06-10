import {
  consentEvidenceKey,
  getRequiredConsentEvidenceStatus,
  mdiLinkageKey,
  patientProfileKey,
  stripeLinkageKey,
  type AppDataRecord,
  type AppDataRepository,
  type AppDataResult,
} from "@/lib/dynamodb/app-data";
import { currentRequiredConsents } from "@/lib/consents";
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

  const consent = getRequiredConsentEvidenceStatus(repository, {
    cognitoSub: input.cognitoSub,
  });
  if (!consent.ok) {
    return consent;
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
      consentAccepted: consent.value.accepted,
      ...(profile.value
        ? {
            onboardingStatus: profile.value.onboardingStatus,
            ...(profile.value.residencyState
              ? { residencyState: profile.value.residencyState }
              : {}),
          }
        : {}),
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

  const consentAccepted = await hasCurrentRequiredConsentEvidence(repository, {
    cognitoSub: input.cognitoSub,
  });
  if (!consentAccepted.ok) {
    return consentAccepted;
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
      consentAccepted: consentAccepted.value,
      ...(profile.value
        ? {
            onboardingStatus: profile.value.onboardingStatus,
            ...(profile.value.residencyState
              ? { residencyState: profile.value.residencyState }
              : {}),
          }
        : {}),
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

async function hasCurrentRequiredConsentEvidence(
  repository: AppDataReadRepository,
  input: { cognitoSub: string },
): Promise<AppDataResult<boolean>> {
  for (const consent of currentRequiredConsents) {
    const record = await repository.get(consentEvidenceKey(
      input.cognitoSub,
      consent.consentKind,
      consent.version,
    ));
    if (!record.ok) {
      return record;
    }
    if (!record.value) {
      return { ok: true, value: false };
    }
    if (record.value.recordType !== "consentEvidence") {
      return appDataErr("validation_failed", "Consent key contains another record type");
    }
  }

  return { ok: true, value: true };
}

function appDataErr(
  kind: "validation_failed",
  message: string,
): AppDataResult<never> {
  return { ok: false, error: { kind, message } };
}
