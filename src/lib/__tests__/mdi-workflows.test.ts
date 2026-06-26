import { describe, expect, it, vi } from "vitest";
import {
  type AppDataRepository,
  createInMemoryAppDataRepository,
  createMdiPatientLinkageIfAbsent,
  createPatientProfileRecord,
  linkMdiPatientCase,
  listEvidenceEventsForPatient,
} from "@/lib/dynamodb/app-data";
import {
  createMdiWorkflowUrlEventId,
  isMdiWorkflowCode,
  isMdiWorkflowRequestId,
  requestMdiWorkflowUrl,
  type MdiWorkflowUrlGateway,
} from "@/lib/mdi-workflows";

const now = "2026-06-15T14:00:00.000Z";
const cognitoSub = "cognito-sub-workflow";
const mdiPatientId = "mdi_patient_workflow_001";
const mdiCaseId = "mdi_case_workflow_001";

describe("MDI workflow URL helpers", () => {
  it("issues approved workflow URLs while persisting only bounded evidence", async () => {
    const repository = seededRepository();
    const gateway = createGateway();

    const messaging = await requestMdiWorkflowUrl(
      repository,
      { cognitoSub, workflow: "messaging" },
      { gateway, now, requestId: "req_workflow_message_001" },
    );
    const fileUpload = await requestMdiWorkflowUrl(
      repository,
      { cognitoSub, workflow: "file_upload" },
      { gateway, now: "2026-06-15T14:01:00.000Z", requestId: "req_workflow_file_001" },
    );
    const introVideo = await requestMdiWorkflowUrl(
      repository,
      { cognitoSub, workflow: "intro_video" },
      { gateway, now: "2026-06-15T14:02:00.000Z", requestId: "req_workflow_intro_001" },
    );

    expect(messaging).toEqual({
      ok: true,
      expiresAt: "2026-06-15T14:05:00.000Z",
      launchMode: "link",
      url: "https://mdi.example.test/messages?token=secret_message_token",
      workflow: "messaging",
    });
    expect(fileUpload).toMatchObject({
      ok: true,
      url: "https://mdi.example.test/files?token=secret_file_token",
      workflow: "file_upload",
    });
    expect(introVideo).toMatchObject({
      ok: true,
      url: "https://mdi.example.test/video?token=secret_video_token",
      workflow: "intro_video",
    });
    expect(gateway.getMessagingWorkflowUrl).toHaveBeenCalledWith(
      { caseId: mdiCaseId, patientId: mdiPatientId },
      undefined,
    );
    expect(gateway.getFileUploadWorkflowUrl).toHaveBeenCalledWith(
      { patientId: mdiPatientId },
      undefined,
    );
    expect(gateway.getIntroVideoWorkflowUrl).toHaveBeenCalledWith(
      { patientId: mdiPatientId },
      undefined,
    );

    const evidence = listEvidenceEventsForPatient(repository, { cognitoSub, limit: 10 });
    expect(evidence.ok && evidence.value.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventId: createMdiWorkflowUrlEventId({
            mdiPatientId,
            requestId: "req_workflow_message_001",
            workflow: "messaging",
          }),
          eventType: "mdi_workflow_url_requested",
          metadata: { outcome: "issued", workflow: "messaging" },
          requestId: "req_workflow_message_001",
          status: "recorded",
        }),
        expect.objectContaining({
          eventType: "mdi_workflow_url_requested",
          metadata: { outcome: "issued", workflow: "file_upload" },
          requestId: "req_workflow_file_001",
          status: "recorded",
        }),
        expect.objectContaining({
          eventType: "mdi_workflow_url_requested",
          metadata: { outcome: "issued", workflow: "intro_video" },
          requestId: "req_workflow_intro_001",
          status: "recorded",
        }),
      ]),
    );
    const storedEvidence = JSON.stringify(evidence.ok && evidence.value.items);
    expect(storedEvidence).not.toContain("https://mdi.example.test");
    expect(storedEvidence).not.toContain("secret_");
    expect(storedEvidence).not.toContain("verification_code");
    if (!evidence.ok) {
      throw new Error("Expected workflow evidence list to succeed");
    }
    const fileEvidence = evidence.value.items.find(
      (item) => item.requestId === "req_workflow_file_001",
    );
    const introEvidence = evidence.value.items.find(
      (item) => item.requestId === "req_workflow_intro_001",
    );
    expect(fileEvidence).not.toHaveProperty("mdiCaseId");
    expect(introEvidence).not.toHaveProperty("mdiCaseId");
  });

  it("does not call MDI when the patient is not linked", async () => {
    const repository = createInMemoryAppDataRepository([
      createPatientProfileRecord({
        cognitoSub,
        now,
        onboardingStatus: "billing_ready",
      }),
    ]);
    const gateway = createGateway();

    const result = await requestMdiWorkflowUrl(
      repository,
      { cognitoSub, workflow: "file_upload" },
      { gateway, now, requestId: "req_workflow_unlinked_001" },
    );

    expect(result).toEqual({ ok: false, fallback: "not_linked", workflow: "file_upload" });
    expect(gateway.getFileUploadWorkflowUrl).not.toHaveBeenCalled();
    expect(listEvidenceEventsForPatient(repository, { cognitoSub })).toMatchObject({
      ok: true,
      value: { items: [] },
    });
  });

  it("records a bounded fallback when messaging is requested before case linkage", async () => {
    const repository = createInMemoryAppDataRepository([
      createPatientProfileRecord({
        cognitoSub,
        now,
        onboardingStatus: "billing_ready",
      }),
    ]);
    expect(
      createMdiPatientLinkageIfAbsent(repository, { cognitoSub, mdiPatientId, now }).ok,
    ).toBe(true);
    const gateway = createGateway();

    const result = await requestMdiWorkflowUrl(
      repository,
      { cognitoSub, workflow: "messaging" },
      { gateway, now, requestId: "req_workflow_no_case_001" },
    );

    expect(result).toEqual({ ok: false, fallback: "not_linked", workflow: "messaging" });
    expect(gateway.getMessagingWorkflowUrl).not.toHaveBeenCalled();
    expect(listEvidenceEventsForPatient(repository, { cognitoSub })).toMatchObject({
      ok: true,
      value: {
        items: [
          expect.objectContaining({
            eventType: "mdi_workflow_url_requested",
            metadata: { outcome: "not_linked", workflow: "messaging" },
            status: "skipped",
          }),
        ],
      },
    });
  });

  it("records expired fallback for malformed provider workflow URLs", async () => {
    const repository = seededRepository();
    const gateway = createGateway({
      getFileUploadWorkflowUrl: vi.fn(async () => ({
        ok: false as const,
        error: {
          code: "invalid_response" as const,
          message: "MDI workflow URL response was invalid",
          retryable: false,
        },
      })),
    });

    const result = await requestMdiWorkflowUrl(
      repository,
      { cognitoSub, workflow: "file_upload" },
      { gateway, now, requestId: "req_workflow_expired_001" },
    );

    expect(result).toEqual({ ok: false, fallback: "expired", workflow: "file_upload" });
    expect(listEvidenceEventsForPatient(repository, { cognitoSub })).toMatchObject({
      ok: true,
      value: {
        items: [
          expect.objectContaining({
            eventType: "mdi_workflow_url_requested",
            metadata: { outcome: "expired", workflow: "file_upload" },
            status: "skipped",
          }),
        ],
      },
    });
  });

  it("records unavailable fallback for MDI maintenance without storing workflow URLs", async () => {
    const repository = seededRepository();
    const gateway = createGateway({
      getMessagingWorkflowUrl: vi.fn(async () => ({
        ok: false as const,
        error: {
          code: "maintenance" as const,
          message: "MDI maintenance",
          retryAfterSeconds: 300,
          retryable: true,
          status: 418,
        },
      })),
    });

    const result = await requestMdiWorkflowUrl(
      repository,
      { cognitoSub, workflow: "messaging" },
      { gateway, now, requestId: "req_workflow_maintenance_001" },
    );

    expect(result).toEqual({ ok: false, fallback: "unavailable", workflow: "messaging" });
    const evidence = listEvidenceEventsForPatient(repository, { cognitoSub });
    expect(evidence).toMatchObject({
      ok: true,
      value: {
        items: [
          expect.objectContaining({
            eventType: "mdi_workflow_url_requested",
            metadata: { outcome: "unavailable", workflow: "messaging" },
            status: "skipped",
          }),
        ],
      },
    });
    expect(JSON.stringify(evidence)).not.toContain("https://mdi.example.test");
    expect(JSON.stringify(evidence)).not.toContain("secret_");
    expect(JSON.stringify(evidence)).not.toContain("ANSWER_VALUE_SENTINEL");
  });

  it("enforces runtime allowlists before provider side effects", async () => {
    const repository = seededRepository();
    const gateway = createGateway();

    const unsupported = await requestMdiWorkflowUrl(
      repositoryThatMustNotBeTouched(),
      { cognitoSub, workflow: "exam" },
      { gateway, now, requestId: "req_workflow_unsupported_001" },
    );
    const unsafeRequestId = await requestMdiWorkflowUrl(
      repositoryThatMustNotBeTouched(),
      { cognitoSub, workflow: "file_upload" },
      { gateway, now, requestId: "req_bearer_token_secret" },
    );
    const unsafeClinicalRequestId = await requestMdiWorkflowUrl(
      repositoryThatMustNotBeTouched(),
      { cognitoSub, workflow: "file_upload" },
      { gateway, now, requestId: "req_hiv_001" },
    );
    const result = await requestMdiWorkflowUrl(
      repository,
      { cognitoSub, workflow: "file_upload" },
      { gateway, now, requestId: "req_bad.token" as never },
    );

    expect(unsupported).toEqual({ ok: false, fallback: "unsupported", workflow: "unsupported" });
    expect(unsafeRequestId).toEqual({
      ok: false,
      fallback: "unavailable",
      workflow: "file_upload",
    });
    expect(unsafeClinicalRequestId).toEqual({
      ok: false,
      fallback: "unavailable",
      workflow: "file_upload",
    });
    expect(result).toEqual({ ok: false, fallback: "unavailable", workflow: "file_upload" });
    expect(gateway.getFileUploadWorkflowUrl).not.toHaveBeenCalled();
    expect(isMdiWorkflowCode("messaging")).toBe(true);
    expect(isMdiWorkflowCode("exam")).toBe(false);
    expect(isMdiWorkflowRequestId("req_workflow_001")).toBe(true);
    expect(isMdiWorkflowRequestId("req_bad.token")).toBe(false);
    expect(isMdiWorkflowRequestId("req_bearer_token_secret")).toBe(false);
    expect(isMdiWorkflowRequestId("req_hiv_001")).toBe(false);
  });
});

function seededRepository() {
  const repository = createInMemoryAppDataRepository([
    createPatientProfileRecord({
      cognitoSub,
      now,
      onboardingStatus: "billing_ready",
    }),
  ]);
  expect(
    linkMdiPatientCase(repository, {
      cognitoSub,
      mdiCaseId,
      mdiPatientId,
      now,
    }).ok,
  ).toBe(true);

  return repository;
}

function repositoryThatMustNotBeTouched(): AppDataRepository {
  return new Proxy({} as AppDataRepository, {
    get() {
      throw new Error("Unsupported workflow touched app-data repository");
    },
  });
}

function createGateway(overrides: Partial<MdiWorkflowUrlGateway> = {}): MdiWorkflowUrlGateway {
  return {
    getFileUploadWorkflowUrl: vi.fn(async () => ({
      ok: true as const,
      value: {
        url: "https://mdi.example.test/files?token=secret_file_token",
        workflow: "file_upload" as const,
      },
    })),
    getIntroVideoWorkflowUrl: vi.fn(async () => ({
      ok: true as const,
      value: {
        url: "https://mdi.example.test/video?token=secret_video_token",
        workflow: "intro_video" as const,
      },
    })),
    getMessagingWorkflowUrl: vi.fn(async () => ({
      ok: true as const,
      value: {
        url: "https://mdi.example.test/messages?token=secret_message_token",
        workflow: "messaging" as const,
      },
    })),
    ...overrides,
  };
}
