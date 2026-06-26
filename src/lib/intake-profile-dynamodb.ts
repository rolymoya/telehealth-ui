import "server-only";

import {
  createPatientProfileRecord,
  patientProfileKey,
  type AppDataResult,
  type PatientProfileRecord,
} from "@/lib/dynamodb/app-data";
import type { DynamoDbAppDataRepository } from "@/lib/dynamodb/app-data-dynamodb";
import type { UsStateCode } from "../../shared/intake/us-states";

export async function completeIntakePrecheckProfileDynamoDb(
  repository: Pick<DynamoDbAppDataRepository, "get" | "put" | "update">,
  input: {
    cognitoSub: string;
    now: string;
    residencyState: UsStateCode;
  },
): Promise<AppDataResult<PatientProfileRecord>> {
  const existing = await repository.get(patientProfileKey(input.cognitoSub));
  if (!existing.ok) {
    return existing;
  }
  if (!existing.value) {
    const created = createPatientProfileRecord({
      cognitoSub: input.cognitoSub,
      now: input.now,
      onboardingStatus: "intake_ready",
      residencyState: input.residencyState,
    });
    const put = await repository.put(created, { ifNotExists: true });
    return put.ok || put.error.kind !== "conditional_conflict"
      ? put
      : readCompletedIntakePrecheckProfile(repository, input);
  }
  if (existing.value.recordType !== "patientProfile") {
    return appDataErr("validation_failed", "Patient profile key contains another record type");
  }
  if (
    existing.value.onboardingStatus !== "profile_pending" &&
    existing.value.onboardingStatus !== "intake_ready"
  ) {
    return { ok: true, value: existing.value };
  }
  if (
    existing.value.onboardingStatus === "intake_ready" &&
    existing.value.residencyState === input.residencyState
  ) {
    return { ok: true, value: existing.value };
  }
  if (
    existing.value.onboardingStatus === "intake_ready" &&
    existing.value.residencyState &&
    existing.value.residencyState !== input.residencyState
  ) {
    return appDataErr(
      "stale_transition",
      "Residency state did not match existing intake-ready profile",
    );
  }

  const next: PatientProfileRecord = {
    ...existing.value,
    onboardingStatus: "intake_ready",
    residencyState: input.residencyState,
    updatedAt: input.now,
  };
  const updated = await repository.update(next, { expected: existing.value });
  return updated.ok || updated.error.kind !== "conditional_conflict"
    ? updated
    : readCompletedIntakePrecheckProfile(repository, input);
}

async function readCompletedIntakePrecheckProfile(
  repository: Pick<DynamoDbAppDataRepository, "get">,
  input: {
    cognitoSub: string;
    residencyState: UsStateCode;
  },
): Promise<AppDataResult<PatientProfileRecord>> {
  const reread = await repository.get(patientProfileKey(input.cognitoSub));
  if (!reread.ok) {
    return reread;
  }
  if (!reread.value || reread.value.recordType !== "patientProfile") {
    return appDataErr(
      "conditional_conflict",
      "Intake profile write conflicted but no profile could be read",
    );
  }
  if (
    reread.value.onboardingStatus === "intake_ready" &&
    reread.value.residencyState === input.residencyState
  ) {
    return { ok: true, value: reread.value };
  }
  return appDataErr(
    "conditional_conflict",
    "Intake profile write conflicted before residency was current",
  );
}

function appDataErr(
  kind: "conditional_conflict" | "stale_transition" | "validation_failed",
  message: string,
): AppDataResult<never> {
  return { ok: false, error: { kind, message } };
}
