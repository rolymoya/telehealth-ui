import { describe, expect, it } from "vitest";
import {
  createInMemoryAppDataRepository,
  createWebhookEvidenceEventId,
  createPatientProfileRecord,
  linkMdiPatientCase,
  linkStripeCustomer,
  recordCurrentMdiCaseStatusEvidence,
  recordEvidenceEvent,
} from "@/lib/dynamodb/app-data";
import {
  createUnavailablePatientDashboard,
  loadPatientDashboard,
} from "@/lib/patient-dashboard";

const cognitoSub = "cognito-sub-dashboard";
const now = "2026-06-21T17:00:00.000Z";
const mdiPatientId = "mdi_patient_dashboard_001";
const mdiCaseId = "mdi_case_dashboard_001";

describe("patient dashboard view model", () => {
  it("maps MDI status, safe dashboard cues, and billing mirrors without clinical content", async () => {
    const repository = seededRepository();
    expect(recordCurrentMdiCaseStatusEvidence(repository, {
      actorType: "vendor",
      caseStatus: "clinical_review",
      cognitoSub,
      eventCategory: "webhook",
      eventId: createWebhookEvidenceEventId(
        "mdi",
        "mdi_evt_dashboard_status_001",
        "WEBHOOK_SIDE_EFFECT_APPLIED",
        "mdi_status_update",
      ),
      eventType: "webhook_side_effect_applied",
      mdiCaseId,
      mdiPatientId,
      metadata: { side_effect: "mdi_status_update", case_status: "clinical_review" },
      occurredAt: "2026-06-21T17:02:00.000Z",
      recordedAt: "2026-06-21T17:02:10.000Z",
      source: "webhook",
      status: "succeeded",
      statusRank: 20,
      summaryCode: "WEBHOOK_SIDE_EFFECT_APPLIED",
      terminal: false,
      webhookEventId: "mdi_evt_dashboard_status_001",
      webhookProvider: "mdi",
    }).ok).toBe(true);
    recordMessageCue(repository);
    expect(linkStripeCustomer(repository, {
      billingStatus: "payment_method_collected",
      cognitoSub,
      now,
      stripeCustomerId: "cus_dashboard_001",
    }).ok).toBe(true);

    const dashboard = await loadPatientDashboard(repository, { cognitoSub, now });

    expect(dashboard).toMatchObject({
      ok: true,
      value: {
        actions: [
          expect.objectContaining({
            code: "open_mdi_messages",
            workflow: "messaging",
          }),
        ],
        billing: {
          code: "billing_pending_approval",
        },
        caseStatus: {
          code: "case_status_clinical_review",
        },
      },
    });
    expect(JSON.stringify(dashboard)).not.toContain("QUESTION_TEXT_SENTINEL");
    expect(JSON.stringify(dashboard)).not.toContain("ANSWER_VALUE_SENTINEL");
    expect(JSON.stringify(dashboard)).not.toContain("clinical note");
    expect(JSON.stringify(dashboard)).not.toContain("https://mdi.example.test");
    expect(JSON.stringify(dashboard)).not.toContain("secret_token");
    expect(JSON.stringify(dashboard)).not.toContain("semaglutide");
    expect(JSON.stringify(dashboard)).not.toContain("prescription");
    expect(JSON.stringify(dashboard)).not.toContain("cus_dashboard_001");
  });

  it("does not show active billing until the T-078 clinical unlock state is present", async () => {
    const repository = seededRepository({ onboardingStatus: "clinical_review" });
    expect(linkStripeCustomer(repository, {
      billingStatus: "active",
      cognitoSub,
      now,
      stripeCustomerId: "cus_dashboard_002",
      stripeSubscriptionId: "sub_dashboard_002",
    }).ok).toBe(true);

    await expect(loadPatientDashboard(repository, { cognitoSub, now }))
      .resolves.toMatchObject({
        ok: true,
        value: {
          billing: {
            code: "billing_pending_approval",
          },
        },
      });
  });

  it("includes patient-scoped MDI cues that are not attached to a case ID", async () => {
    const repository = seededRepository();
    expect(recordEvidenceEvent(repository, {
      actorType: "vendor",
      cognitoSub,
      eventCategory: "mdi_handoff",
      eventId: "mdi:dashboard_cue:patient:mdi_patient_dashboard_001:open_mdi_messages:mdi_message_dashboard_patient_001:mdi_evt_dashboard_cue_patient_001",
      eventType: "mdi_dashboard_cue_recorded",
      mdiPatientId,
      metadata: {
        cue_action: "open_mdi",
        cue_code: "open_mdi_messages",
        cue_family: "message",
      },
      occurredAt: "2026-06-21T17:06:00.000Z",
      recordedAt: "2026-06-21T17:06:10.000Z",
      source: "webhook",
      status: "recorded",
      summaryCode: "MDI_DASHBOARD_CUE_RECORDED",
    }).ok).toBe(true);

    await expect(loadPatientDashboard(repository, { cognitoSub, now }))
      .resolves.toMatchObject({
        ok: true,
        value: {
          actions: [
            expect.objectContaining({
              code: "open_mdi_messages",
            }),
          ],
        },
      });
  });

  it("paginates case evidence so newer dashboard cues are not missed", async () => {
    const repository = seededRepository();
    for (let index = 0; index < 105; index += 1) {
      const padded = String(index).padStart(3, "0");
      expect(recordEvidenceEvent(repository, {
        actorType: "system",
        cognitoSub,
        eventCategory: "mdi_handoff",
        eventId: `mdi:workflow_url:${mdiPatientId}:messaging:req_dashboard_noise_${padded}`,
        eventType: "mdi_workflow_url_requested",
        mdiCaseId,
        mdiPatientId,
        metadata: {
          outcome: "issued",
          workflow: "messaging",
        },
        occurredAt: `2026-06-21T17:${String(index % 60).padStart(2, "0")}:00.000Z`,
        recordedAt: `2026-06-21T17:${String(index % 60).padStart(2, "0")}:00.000Z`,
        requestId: `req_dashboard_noise_${padded}`,
        source: "app",
        status: "recorded",
        summaryCode: "MDI_WORKFLOW_URL_REQUESTED",
      }).ok).toBe(true);
    }
    recordMessageCue(repository);

    await expect(loadPatientDashboard(repository, { cognitoSub, now }))
      .resolves.toMatchObject({
        ok: true,
        value: {
          actions: [
            expect.objectContaining({
              code: "open_mdi_messages",
            }),
          ],
        },
      });
  });

  it("shows active billing only after billing-ready status is mirrored", async () => {
    const repository = seededRepository({ onboardingStatus: "billing_ready" });
    expect(recordCurrentMdiCaseStatusEvidence(repository, {
      actorType: "vendor",
      caseStatus: "billing_ready",
      cognitoSub,
      eventCategory: "webhook",
      eventId: createWebhookEvidenceEventId(
        "mdi",
        "mdi_evt_dashboard_status_002",
        "WEBHOOK_SIDE_EFFECT_APPLIED",
        "mdi_status_update",
      ),
      eventType: "webhook_side_effect_applied",
      mdiCaseId,
      mdiPatientId,
      metadata: { side_effect: "mdi_status_update", case_status: "billing_ready" },
      occurredAt: "2026-06-21T17:05:00.000Z",
      recordedAt: "2026-06-21T17:05:10.000Z",
      source: "webhook",
      status: "succeeded",
      statusRank: 40,
      summaryCode: "WEBHOOK_SIDE_EFFECT_APPLIED",
      terminal: false,
      webhookEventId: "mdi_evt_dashboard_status_002",
      webhookProvider: "mdi",
    }).ok).toBe(true);
    expect(linkStripeCustomer(repository, {
      billingStatus: "active",
      cognitoSub,
      now,
      stripeCustomerId: "cus_dashboard_003",
      stripeSubscriptionId: "sub_dashboard_003",
    }).ok).toBe(true);

    await expect(loadPatientDashboard(repository, { cognitoSub, now }))
      .resolves.toMatchObject({
        ok: true,
        value: {
          billing: {
            code: "billing_active",
          },
          caseStatus: {
            code: "case_status_billing_ready",
          },
        },
      });
  });

  it("shows period-end cancellation state without exposing clinical or Stripe identifiers", async () => {
    const repository = seededRepository({ onboardingStatus: "billing_ready" });
    expect(recordCurrentMdiCaseStatusEvidence(repository, {
      actorType: "vendor",
      caseStatus: "billing_ready",
      cognitoSub,
      eventCategory: "webhook",
      eventId: createWebhookEvidenceEventId(
        "mdi",
        "mdi_evt_dashboard_status_cancel_pending",
        "WEBHOOK_SIDE_EFFECT_APPLIED",
        "mdi_status_update",
      ),
      eventType: "webhook_side_effect_applied",
      mdiCaseId,
      mdiPatientId,
      metadata: { side_effect: "mdi_status_update", case_status: "billing_ready" },
      occurredAt: "2026-06-21T17:05:00.000Z",
      recordedAt: "2026-06-21T17:05:10.000Z",
      source: "webhook",
      status: "succeeded",
      statusRank: 40,
      summaryCode: "WEBHOOK_SIDE_EFFECT_APPLIED",
      terminal: false,
      webhookEventId: "mdi_evt_dashboard_status_cancel_pending",
      webhookProvider: "mdi",
    }).ok).toBe(true);
    expect(linkStripeCustomer(repository, {
      billingStatus: "cancel_pending",
      cognitoSub,
      now,
      stripeCurrentPeriodEnd: "2026-07-23T12:00:00.000Z",
      stripeCustomerId: "cus_dashboard_004",
      stripeSubscriptionId: "sub_dashboard_004",
    }).ok).toBe(true);

    const dashboard = await loadPatientDashboard(repository, { cognitoSub, now });

    expect(dashboard).toMatchObject({
      ok: true,
      value: {
        billing: {
          canCancel: false,
          code: "billing_cancel_pending",
          label: "Cancellation scheduled",
          summary: "Your subscription is set to end at the close of the current billing cycle on July 23, 2026.",
        },
      },
    });
    expect(JSON.stringify(dashboard)).not.toContain("cus_dashboard_004");
    expect(JSON.stringify(dashboard)).not.toContain("sub_dashboard_004");
    expect(JSON.stringify(dashboard)).not.toMatch(
      /condition|diagnosis|symptom|medication|questionnaire|answer/i,
    );
  });

  it("uses a safe unavailable state without workflow URLs or tokens", () => {
    const dashboard = createUnavailablePatientDashboard({ now });

    expect(dashboard).toMatchObject({
      billing: { code: "billing_unavailable" },
      care: {
        followUp: { code: "care_workflow_unavailable" },
        refills: { code: "refills_deferred" },
      },
      caseStatus: { code: "case_status_unavailable" },
    });
    expect(JSON.stringify(dashboard)).not.toContain("token");
    expect(JSON.stringify(dashboard)).not.toContain("https://mdi.example.test");
  });
});

function seededRepository(input: {
  onboardingStatus?: Parameters<typeof createPatientProfileRecord>[0]["onboardingStatus"];
} = {}) {
  const repository = createInMemoryAppDataRepository([
    createPatientProfileRecord({
      cognitoSub,
      now,
      onboardingStatus: input.onboardingStatus ?? "clinical_review",
      residencyState: "IL",
    }),
  ]);
  expect(linkMdiPatientCase(repository, {
    cognitoSub,
    mdiCaseId,
    mdiPatientId,
    now,
  }).ok).toBe(true);
  return repository;
}

function recordMessageCue(
  repository: ReturnType<typeof createInMemoryAppDataRepository>,
) {
  expect(recordEvidenceEvent(repository, {
    actorType: "vendor",
    cognitoSub,
    eventCategory: "mdi_handoff",
    eventId: "mdi:dashboard_cue:case:mdi_case_dashboard_001:open_mdi_messages:mdi_message_dashboard_001:mdi_evt_dashboard_cue_001",
    eventType: "mdi_dashboard_cue_recorded",
    mdiCaseId,
    mdiPatientId,
    metadata: {
      cue_action: "open_mdi",
      cue_code: "open_mdi_messages",
      cue_family: "message",
    },
    occurredAt: "2026-06-21T17:03:00.000Z",
    recordedAt: "2026-06-21T17:03:10.000Z",
    source: "webhook",
    status: "recorded",
    summaryCode: "MDI_DASHBOARD_CUE_RECORDED",
  }).ok).toBe(true);
}
