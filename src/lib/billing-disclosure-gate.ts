import {
  requiredConsentsBeforeBillingOrPrescribing,
} from "@/lib/consents";
import {
  consentEvidenceKey,
  onboardingTreatmentSelectionKey,
  type AppDataKey,
  type AppDataRecord,
  type AppDataResult,
  type OnboardingTreatmentSelectionRecord,
} from "@/lib/dynamodb/app-data";

export type BillingDisclosureGateStatus =
  | "ok"
  | "medication_disclosure_required"
  | "treatment_selection_required"
  | "storage_unavailable";

export type BillingDisclosureGateRepository = {
  get(key: AppDataKey):
    | AppDataResult<AppDataRecord | null>
    | Promise<AppDataResult<AppDataRecord | null>>;
};

export async function evaluateBillingDisclosureGate(
  repository: BillingDisclosureGateRepository,
  input: { cognitoSub: string },
): Promise<{ ok: true; status: BillingDisclosureGateStatus }> {
  const selection = await readTreatmentSelection(repository, input.cognitoSub);
  if (!selection.ok) {
    return { ok: true, status: "storage_unavailable" };
  }
  if (!selection.value) {
    return { ok: true, status: "treatment_selection_required" };
  }

  const requiredConsents = requiredConsentsBeforeBillingOrPrescribing({
    treatment: selection.value.treatment,
  });
  for (const consent of requiredConsents) {
    const evidence = await repository.get(consentEvidenceKey(
      input.cognitoSub,
      consent.consentKind,
      consent.version,
    ));
    if (!evidence.ok) {
      return { ok: true, status: "storage_unavailable" };
    }
    if (!evidence.value) {
      return { ok: true, status: "medication_disclosure_required" };
    }
    if (evidence.value.recordType !== "consentEvidence") {
      return { ok: true, status: "storage_unavailable" };
    }
  }

  return { ok: true, status: "ok" };
}

export async function readTreatmentSelection(
  repository: BillingDisclosureGateRepository,
  cognitoSub: string,
): Promise<AppDataResult<OnboardingTreatmentSelectionRecord | null>> {
  const record = await repository.get(onboardingTreatmentSelectionKey(cognitoSub));
  if (!record.ok || !record.value) {
    return record as AppDataResult<OnboardingTreatmentSelectionRecord | null>;
  }
  if (record.value.recordType !== "onboardingTreatmentSelection") {
    return {
      ok: false,
      error: {
        kind: "validation_failed",
        message: "Treatment selection key contains another record type",
      },
    };
  }
  return { ok: true, value: record.value };
}
