import { describe, expect, it } from "vitest";
import {
  completeIntakePrecheckProfile,
  createInMemoryAppDataRepository,
  createPatientProfileRecord,
  mdiLinkageKey,
  patientProfileKey,
  stripeLinkageKey,
} from "@/lib/dynamodb/app-data";

const cognitoSub = "cognito-sub-intake-profile";
const now = "2026-06-10T20:00:00.000Z";

describe("intake profile completion", () => {
  it("creates a missing profile with only residency state and intake status", () => {
    const repository = createInMemoryAppDataRepository();

    expect(completeIntakePrecheckProfile(repository, {
      cognitoSub,
      now,
      residencyState: "IL",
    })).toMatchObject({
      ok: true,
      value: {
        onboardingStatus: "intake_ready",
        residencyState: "IL",
      },
    });

    expect(repository.get(patientProfileKey(cognitoSub))).toMatchObject({
      ok: true,
      value: {
        cognitoSub,
        onboardingStatus: "intake_ready",
        residencyState: "IL",
      },
    });
    expect(repository.get(mdiLinkageKey(cognitoSub))).toEqual({ ok: true, value: null });
    expect(repository.get(stripeLinkageKey(cognitoSub))).toEqual({ ok: true, value: null });
    expect(JSON.stringify(repository.get(patientProfileKey(cognitoSub))))
      .not.toContain("emergency");
    expect(JSON.stringify(repository.get(patientProfileKey(cognitoSub))))
      .not.toContain("weight");
  });

  it("transitions profile_pending and fills missing intake_ready residency state", () => {
    const repository = createInMemoryAppDataRepository([
      createPatientProfileRecord({
        cognitoSub,
        now,
        onboardingStatus: "profile_pending",
      }),
    ]);

    expect(completeIntakePrecheckProfile(repository, {
      cognitoSub,
      now,
      residencyState: "CA",
    })).toMatchObject({
      ok: true,
      value: {
        onboardingStatus: "intake_ready",
        residencyState: "CA",
      },
    });

    const intakeReadyRepository = createInMemoryAppDataRepository([
      createPatientProfileRecord({
        cognitoSub,
        now,
        onboardingStatus: "intake_ready",
      }),
    ]);
    expect(completeIntakePrecheckProfile(intakeReadyRepository, {
      cognitoSub,
      now,
      residencyState: "NY",
    })).toMatchObject({
      ok: true,
      value: {
        onboardingStatus: "intake_ready",
        residencyState: "NY",
      },
    });
  });

  it("is idempotent for matching intake_ready state and rejects conflicting state", () => {
    const repository = createInMemoryAppDataRepository([
      createPatientProfileRecord({
        cognitoSub,
        now,
        onboardingStatus: "intake_ready",
        residencyState: "IL",
      }),
    ]);

    expect(completeIntakePrecheckProfile(repository, {
      cognitoSub,
      now,
      residencyState: "IL",
    })).toMatchObject({
      ok: true,
      value: {
        onboardingStatus: "intake_ready",
        residencyState: "IL",
      },
    });
    expect(completeIntakePrecheckProfile(repository, {
      cognitoSub,
      now,
      residencyState: "CA",
    })).toMatchObject({
      ok: false,
      error: {
        kind: "stale_transition",
      },
    });
  });

  it("does not regress profiles already past intake", () => {
    const repository = createInMemoryAppDataRepository([
      createPatientProfileRecord({
        cognitoSub,
        now,
        onboardingStatus: "mdi_submitted",
        residencyState: "IL",
      }),
    ]);

    expect(completeIntakePrecheckProfile(repository, {
      cognitoSub,
      now,
      residencyState: "CA",
    })).toMatchObject({
      ok: true,
      value: {
        onboardingStatus: "mdi_submitted",
        residencyState: "IL",
      },
    });
  });
});
