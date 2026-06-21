import { describe, expect, it, vi } from "vitest";
import {
  createInMemoryAppDataRepository,
  createMdiPatientLinkageIfAbsent,
  createPatientProfileRecord,
  linkMdiPatientCase,
  listEvidenceEventsForPatient,
} from "@/lib/dynamodb/app-data";
import {
  getMdiCareWorkflowCapabilities,
  requestMdiFollowUpCareWorkflowUrl,
} from "@/lib/mdi-care-workflows";
import type { MdiWorkflowUrlGateway } from "@/lib/mdi-workflows";

const cognitoSub = "cognito-sub-careworkflow";
const now = "2026-06-21T16:00:00.000Z";
const mdiPatientId = "mdi_patient_care_workflow_001";
const mdiCaseId = "mdi_case_care_workflow_001";

describe("MDI care workflow launch capabilities", () => {
  it("returns unavailable care and deferred refills when MDI linkage is missing", () => {
    const repository = createInMemoryAppDataRepository([
      createPatientProfileRecord({
        cognitoSub,
        now,
        onboardingStatus: "billing_ready",
      }),
    ]);

    expect(getMdiCareWorkflowCapabilities(repository, { cognitoSub })).toEqual({
      ok: true,
      value: {
        followUpCare: {
          actionCode: "care_workflow_unavailable",
          reasonCode: "mdi_not_linked",
        },
        refills: {
          actionCode: "refills_deferred",
          reasonCode: "no_approved_refill_route",
        },
      },
    });
  });

  it("does not expose follow-up care launch before case linkage exists", () => {
    const repository = createInMemoryAppDataRepository([
      createPatientProfileRecord({
        cognitoSub,
        now,
        onboardingStatus: "billing_ready",
      }),
    ]);
    expect(createMdiPatientLinkageIfAbsent(repository, { cognitoSub, mdiPatientId, now }).ok)
      .toBe(true);

    expect(getMdiCareWorkflowCapabilities(repository, { cognitoSub })).toEqual({
      ok: true,
      value: {
        followUpCare: {
          actionCode: "care_workflow_unavailable",
          reasonCode: "mdi_case_not_linked",
        },
        refills: {
          actionCode: "refills_deferred",
          reasonCode: "no_approved_refill_route",
        },
      },
    });
  });

  it("maps linked follow-up care to MDI messaging while refills remain deferred", () => {
    const repository = seededRepository();

    expect(getMdiCareWorkflowCapabilities(repository, { cognitoSub })).toEqual({
      ok: true,
      value: {
        followUpCare: {
          actionCode: "open_mdi_care",
          reasonCode: "open_mdi_messaging",
          workflow: "messaging",
        },
        refills: {
          actionCode: "refills_deferred",
          reasonCode: "no_approved_refill_route",
        },
      },
    });
  });

  it("launches follow-up care through the approved messaging workflow without storing URLs", async () => {
    const repository = seededRepository();
    const gateway = createGateway();

    const result = await requestMdiFollowUpCareWorkflowUrl(
      repository,
      { cognitoSub },
      { gateway, now, requestId: "req_care_workflow_001" },
    );

    expect(result).toEqual({
      ok: true,
      expiresAt: "2026-06-21T16:05:00.000Z",
      launchMode: "link",
      url: "https://mdi.example.test/messages?token=secret_care_token",
      workflow: "messaging",
    });
    expect(gateway.getMessagingWorkflowUrl).toHaveBeenCalledWith(
      { caseId: mdiCaseId, patientId: mdiPatientId },
      undefined,
    );
    expect(gateway.getFileUploadWorkflowUrl).not.toHaveBeenCalled();
    expect(gateway.getIntroVideoWorkflowUrl).not.toHaveBeenCalled();

    const evidence = listEvidenceEventsForPatient(repository, { cognitoSub, limit: 10 });
    expect(evidence).toMatchObject({
      ok: true,
      value: {
        items: [
          expect.objectContaining({
            eventType: "mdi_workflow_url_requested",
            metadata: { outcome: "issued", workflow: "messaging" },
            requestId: "req_care_workflow_001",
            status: "recorded",
          }),
        ],
      },
    });
    expect(JSON.stringify(evidence)).not.toContain("https://mdi.example.test");
    expect(JSON.stringify(evidence)).not.toContain("secret_care_token");
    expect(JSON.stringify(evidence)).not.toContain("refill");
    expect(JSON.stringify(evidence)).not.toContain("prescription");
    expect(JSON.stringify(evidence)).not.toContain("medication");
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
  expect(linkMdiPatientCase(repository, { cognitoSub, mdiCaseId, mdiPatientId, now }).ok)
    .toBe(true);
  return repository;
}

function createGateway(): MdiWorkflowUrlGateway {
  return {
    getFileUploadWorkflowUrl: vi.fn(async () => {
      throw new Error("file upload workflow should not be used for follow-up care");
    }),
    getIntroVideoWorkflowUrl: vi.fn(async () => {
      throw new Error("intro video workflow should not be used for follow-up care");
    }),
    getMessagingWorkflowUrl: vi.fn(async () => ({
      ok: true as const,
      value: {
        url: "https://mdi.example.test/messages?token=secret_care_token",
        workflow: "messaging" as const,
      },
    })),
  };
}
