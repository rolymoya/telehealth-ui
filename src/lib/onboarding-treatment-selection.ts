import {
  createOnboardingTreatmentSelectionRecord,
  onboardingTreatmentSelectionKey,
  type AppDataRecord,
  type AppDataResult,
  type OnboardingTreatmentSelectionRecord,
} from "@/lib/dynamodb/app-data";
import type { LaunchOfferingSlug } from "../../shared/intake/precheck";

export type AsyncTreatmentSelectionRepository = {
  get(key: ReturnType<typeof onboardingTreatmentSelectionKey>):
    | AppDataResult<AppDataRecord | null>
    | Promise<AppDataResult<AppDataRecord | null>>;
  put<T extends AppDataRecord>(
    record: T,
    options?: { ifNotExists?: boolean },
  ): AppDataResult<T> | Promise<AppDataResult<T>>;
};

export async function recordOnboardingTreatmentSelectionAsync(
  repository: AsyncTreatmentSelectionRepository,
  input: {
    cognitoSub: string;
    now: string;
    questionnaireId: string;
    treatment: LaunchOfferingSlug;
  },
): Promise<AppDataResult<OnboardingTreatmentSelectionRecord>> {
  const existing = await repository.get(onboardingTreatmentSelectionKey(input.cognitoSub));
  if (!existing.ok) {
    return existing;
  }
  if (existing.value) {
    if (existing.value.recordType !== "onboardingTreatmentSelection") {
      return {
        ok: false,
        error: {
          kind: "validation_failed",
          message: "Treatment selection key contains another record type",
        },
      };
    }
    if (
      existing.value.treatment === input.treatment &&
      existing.value.questionnaireId === input.questionnaireId
    ) {
      return { ok: true, value: existing.value };
    }
    return {
      ok: false,
      error: {
        kind: "validation_failed",
        message: "Treatment selection conflicts with existing questionnaire selection",
      },
    };
  }

  return repository.put(createOnboardingTreatmentSelectionRecord(input), {
    ifNotExists: true,
  });
}
