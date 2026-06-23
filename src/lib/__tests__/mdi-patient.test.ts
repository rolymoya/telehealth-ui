import { describe, expect, it, vi } from "vitest";
import {
  createInMemoryAppDataRepository,
  createMdiPatientCreateAttemptRecord,
  createPatientProfileRecord,
  getMdiPatientCreateAttempt,
  linkMdiPatientCase,
  mdiLinkageKey,
  patientProfileKey,
} from "@/lib/dynamodb/app-data";
import {
  createAppDataMdiPatientRepository,
  createMdiPatientIdempotencyKey,
  createMdiPatientLinkage,
  mdiPatientFailure,
  type MdiPatientGateway,
  type MdiPatientRepository,
} from "@/lib/mdi-patient";

const cognitoSub = "cognito-sub-mdi-patient";
const now = "2026-06-20T20:00:00.000Z";
const patientPayload = {
  address: {
    city_name: "PAYLOAD_CITY_SENTINEL",
  },
  email: "payload@example.invalid",
  first_name: "PAYLOAD_NAME_SENTINEL",
  last_name: "Example",
};

describe("MDI patient creation orchestration", () => {
  it("returns existing patient linkage without calling MDI", async () => {
    const repository = createInMemoryAppDataRepository([
      createPatientProfileRecord({
        cognitoSub,
        now,
        onboardingStatus: "intake_ready",
      }),
    ]);
    linkMdiPatientCase(repository, {
      cognitoSub,
      mdiPatientId: "mdi_patient_existing",
      now,
    });
    const gateway = gatewayWithCreate(vi.fn());

    await expect(createMdiPatientLinkage(
      { cognitoSub, patient: patientPayload },
      {
        gateway,
        now: () => new Date(now),
        repository: createAppDataMdiPatientRepository(repository),
      },
    )).resolves.toEqual({
      ok: true,
      value: {
        linkedAt: now,
        mdiPatientId: "mdi_patient_existing",
        status: "linked",
      },
    });
    expect(gateway.createPatient).not.toHaveBeenCalled();
  });

  it("creates an MDI patient and stores only pointer plus non-PHI attempt status", async () => {
    const repository = createInMemoryAppDataRepository([
      createPatientProfileRecord({
        cognitoSub,
        now,
        onboardingStatus: "intake_ready",
      }),
    ]);
    const createPatient = vi.fn(async () => ({
      ok: true as const,
      value: { mdiPatientId: "mdi_patient_created" },
    }));

    await expect(createMdiPatientLinkage(
      { cognitoSub, patient: patientPayload },
      {
        gateway: gatewayWithCreate(createPatient),
        now: () => new Date(now),
        repository: createAppDataMdiPatientRepository(repository),
      },
    )).resolves.toEqual({
      ok: true,
      value: {
        linkedAt: now,
        mdiPatientId: "mdi_patient_created",
        status: "linked",
      },
    });

    expect(createPatient).toHaveBeenCalledWith({
      idempotencyKey: createMdiPatientIdempotencyKey(cognitoSub),
      patient: patientPayload,
    });
    expect(repository.get(mdiLinkageKey(cognitoSub))).toMatchObject({
      ok: true,
      value: {
        mdiPatientId: "mdi_patient_created",
        recordType: "mdiLinkage",
      },
    });
    expect(getMdiPatientCreateAttempt(repository, cognitoSub)).toMatchObject({
      ok: true,
      value: {
        attempts: 1,
        idempotencyKey: createMdiPatientIdempotencyKey(cognitoSub),
        linkedAt: now,
        mdiPatientId: "mdi_patient_created",
        status: "linked",
      },
    });

    const stored = repository.queryByKeyPrefix({
      pk: patientProfileKey(cognitoSub).pk,
      skPrefix: "",
    });
    expect(JSON.stringify(stored)).not.toContain("PAYLOAD_NAME_SENTINEL");
    expect(JSON.stringify(stored)).not.toContain("payload@example.invalid");
    expect(JSON.stringify(stored)).not.toContain("PAYLOAD_CITY_SENTINEL");
  });

  it("records retryable provider failures without retaining payload fields", async () => {
    const repository = createInMemoryAppDataRepository([
      createPatientProfileRecord({
        cognitoSub,
        now,
        onboardingStatus: "intake_ready",
      }),
    ]);

    await expect(createMdiPatientLinkage(
      { cognitoSub, patient: patientPayload },
      {
        gateway: gatewayWithCreate(vi.fn(async () =>
          mdiPatientFailure("provider_unavailable", "MDI unavailable", {
            retryable: true,
            status: 503,
          })
        )),
        now: () => new Date(now),
        repository: createAppDataMdiPatientRepository(repository),
      },
    )).resolves.toMatchObject({
      ok: false,
      error: {
        code: "provider_unavailable",
        retryable: true,
        status: 503,
      },
    });

    expect(getMdiPatientCreateAttempt(repository, cognitoSub)).toMatchObject({
      ok: true,
      value: {
        attempts: 1,
        providerStatus: 503,
        status: "provider_retryable_failure",
      },
    });
    expect(JSON.stringify(repository.queryByKeyPrefix({
      pk: patientProfileKey(cognitoSub).pk,
      skPrefix: "",
    }))).not.toMatch(/PAYLOAD_NAME_SENTINEL|payload@example\.invalid|PAYLOAD_CITY_SENTINEL/);
  });

  it("retries maintenance failures with the same opaque idempotency key", async () => {
    const repository = createInMemoryAppDataRepository([
      createPatientProfileRecord({
        cognitoSub,
        now,
        onboardingStatus: "intake_ready",
      }),
    ]);
    const createPatient = vi
      .fn()
      .mockResolvedValueOnce(mdiPatientFailure("provider_unavailable", "MDI maintenance", {
        retryAfterSeconds: 300,
        retryable: true,
        status: 418,
      }))
      .mockResolvedValueOnce({
        ok: true as const,
        value: { mdiPatientId: "mdi_patient_after_maintenance" },
      });

    await expect(createMdiPatientLinkage(
      { cognitoSub, patient: patientPayload },
      {
        gateway: gatewayWithCreate(createPatient),
        now: () => new Date(now),
        repository: createAppDataMdiPatientRepository(repository),
      },
    )).resolves.toMatchObject({
      ok: false,
      error: {
        code: "provider_unavailable",
        retryAfterSeconds: 300,
        retryable: true,
        status: 418,
      },
    });

    expect(getMdiPatientCreateAttempt(repository, cognitoSub)).toMatchObject({
      ok: true,
      value: {
        attempts: 1,
        idempotencyKey: createMdiPatientIdempotencyKey(cognitoSub),
        providerStatus: 418,
        retryAfterSeconds: 300,
        status: "provider_retryable_failure",
      },
    });

    await expect(createMdiPatientLinkage(
      { cognitoSub, patient: patientPayload },
      {
        gateway: gatewayWithCreate(createPatient),
        now: () => new Date("2026-06-20T20:05:00.000Z"),
        repository: createAppDataMdiPatientRepository(repository),
      },
    )).resolves.toMatchObject({
      ok: true,
      value: {
        mdiPatientId: "mdi_patient_after_maintenance",
      },
    });

    expect(createPatient).toHaveBeenNthCalledWith(1, {
      idempotencyKey: createMdiPatientIdempotencyKey(cognitoSub),
      patient: patientPayload,
    });
    expect(createPatient).toHaveBeenNthCalledWith(2, {
      idempotencyKey: createMdiPatientIdempotencyKey(cognitoSub),
      patient: patientPayload,
    });
  });

  it("does not call MDI when another create claim is already in progress", async () => {
    const repository = createInMemoryAppDataRepository([
      createPatientProfileRecord({
        cognitoSub,
        now,
        onboardingStatus: "intake_ready",
      }),
      createMdiPatientCreateAttemptRecord({
        attempts: 1,
        claimExpiresAt: "2026-06-20T20:15:00.000Z",
        cognitoSub,
        idempotencyKey: createMdiPatientIdempotencyKey(cognitoSub),
        lastAttemptAt: now,
        now,
        status: "claiming",
      }),
    ]);
    const gateway = gatewayWithCreate(vi.fn());

    await expect(createMdiPatientLinkage(
      { cognitoSub, patient: patientPayload },
      {
        gateway,
        now: () => new Date(now),
        repository: createAppDataMdiPatientRepository(repository),
      },
    )).resolves.toMatchObject({
      ok: false,
      error: {
        code: "create_in_progress",
        retryable: true,
      },
    });
    expect(gateway.createPatient).not.toHaveBeenCalled();
  });

  it("retries an expired claim with the same idempotency key", async () => {
    const repository = createInMemoryAppDataRepository([
      createPatientProfileRecord({
        cognitoSub,
        now,
        onboardingStatus: "intake_ready",
      }),
      createMdiPatientCreateAttemptRecord({
        attempts: 1,
        claimExpiresAt: "2026-06-20T20:10:00.000Z",
        cognitoSub,
        idempotencyKey: "mdi-patient-expired-key",
        lastAttemptAt: now,
        now,
        status: "claiming",
      }),
    ]);
    const createPatient = vi.fn(async () => ({
      ok: true as const,
      value: { mdiPatientId: "mdi_patient_after_expired_claim" },
    }));

    await createMdiPatientLinkage(
      { cognitoSub, patient: patientPayload },
      {
        gateway: gatewayWithCreate(createPatient),
        now: () => new Date("2026-06-20T20:20:00.000Z"),
        repository: createAppDataMdiPatientRepository(repository),
      },
    );

    expect(createPatient).toHaveBeenCalledWith({
      idempotencyKey: "mdi-patient-expired-key",
      patient: patientPayload,
    });
  });

  it("links a stored MDI patient pointer after a retryable storage failure", async () => {
    const repository = createInMemoryAppDataRepository([
      createPatientProfileRecord({
        cognitoSub,
        now,
        onboardingStatus: "intake_ready",
      }),
      createMdiPatientCreateAttemptRecord({
        attempts: 1,
        cognitoSub,
        idempotencyKey: "mdi-patient-existing-key",
        lastAttemptAt: now,
        mdiPatientId: "mdi_patient_retry",
        now,
        status: "storage_retryable_failure",
      }),
    ]);
    const gateway = gatewayWithCreate(vi.fn());

    await expect(createMdiPatientLinkage(
      { cognitoSub, patient: patientPayload },
      {
        gateway,
        now: () => new Date("2026-06-20T20:20:00.000Z"),
        repository: createAppDataMdiPatientRepository(repository),
      },
    )).resolves.toEqual({
      ok: true,
      value: {
        linkedAt: "2026-06-20T20:20:00.000Z",
        mdiPatientId: "mdi_patient_retry",
        status: "linked",
      },
    });

    expect(gateway.createPatient).not.toHaveBeenCalled();
    expect(repository.get(mdiLinkageKey(cognitoSub))).toMatchObject({
      ok: true,
      value: {
        mdiPatientId: "mdi_patient_retry",
      },
    });
  });

  it("records provider-created patient IDs when local linkage storage fails", async () => {
    const recordFailure = vi.fn(async () => ({
      ok: true as const,
      value: createMdiPatientCreateAttemptRecord({
        attempts: 1,
        cognitoSub,
        idempotencyKey: "mdi-patient-claim",
        mdiPatientId: "mdi_patient_created_then_storage_failed",
        now,
        status: "storage_retryable_failure",
      }),
    }));
    const repository: MdiPatientRepository = {
      claimCreate: vi.fn(async () => ({
        ok: true as const,
        value: {
          idempotencyKey: "mdi-patient-claim",
          outcome: "claimed" as const,
        },
      })),
      getStatus: vi.fn(async () => ({
        ok: true as const,
        value: {
          onboardingStatus: "intake_ready" as const,
        },
      })),
      recordFailure,
      saveLinked: vi.fn(async () =>
        mdiPatientFailure("storage_failed", "DynamoDB unavailable", {
          retryable: true,
          status: 500,
        })
      ),
    };

    await expect(createMdiPatientLinkage(
      { cognitoSub, patient: patientPayload },
      {
        gateway: gatewayWithCreate(vi.fn(async () => ({
          ok: true as const,
          value: { mdiPatientId: "mdi_patient_created_then_storage_failed" },
        }))),
        now: () => new Date(now),
        repository,
      },
    )).resolves.toMatchObject({
      ok: false,
      error: {
        code: "storage_failed",
      },
    });

    expect(recordFailure).toHaveBeenCalledWith(expect.objectContaining({
      mdiPatientId: "mdi_patient_created_then_storage_failed",
      status: "storage_retryable_failure",
    }));
  });

  it("returns an existing pointer if storage observes a concurrent link", async () => {
    const createPatient = vi.fn(async () => ({
      ok: true as const,
      value: { mdiPatientId: "mdi_patient_provider_new" },
    }));
    const repository: MdiPatientRepository = {
      claimCreate: vi.fn(async () => ({
        ok: true as const,
        value: {
          idempotencyKey: "mdi-patient-claim",
          outcome: "claimed" as const,
        },
      })),
      getStatus: vi.fn(async () => ({
        ok: true as const,
        value: {
          onboardingStatus: "intake_ready" as const,
        },
      })),
      recordFailure: vi.fn(),
      saveLinked: vi.fn(async () => ({
        ok: true as const,
        value: {
          linkedAt: now,
          mdiPatientId: "mdi_patient_concurrent_existing",
        },
      })),
    };

    await expect(createMdiPatientLinkage(
      { cognitoSub, patient: patientPayload },
      {
        gateway: gatewayWithCreate(createPatient),
        now: () => new Date(now),
        repository,
      },
    )).resolves.toEqual({
      ok: true,
      value: {
        linkedAt: now,
        mdiPatientId: "mdi_patient_concurrent_existing",
        status: "linked",
      },
    });
  });
});

function gatewayWithCreate(
  createPatient: MdiPatientGateway["createPatient"],
): MdiPatientGateway {
  return { createPatient };
}
