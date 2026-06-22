import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  createInMemoryAppDataRepository,
  createPatientProfileRecord,
  getPatientProfile,
  getStripeLinkage,
  linkMdiPatientCase,
  linkStripeCustomer,
  listEvidenceEventsForPatient,
  mdiCaseStatusMirrorKey,
  type AppDataError,
  type BillingStatus,
  createWebhookEvidenceEventId,
  recordEvidenceEvent,
} from "@/lib/dynamodb/app-data";
import {
  createInMemoryMdiWebhookMirrorRepository,
  handleMdiWebhook,
  mdiWebhookEventContracts,
} from "@/lib/mdi-webhooks";
import caseChargeEvents from "../../../tests/fixtures/mdi/case-charge-events.json";
import { createWebhookProcessingRepository } from "@/lib/webhook-processing-repository";
import type { WebhookProcessingRepository } from "@/lib/webhooks";

describe("MDI webhook receiver service", () => {
  it("rejects missing or invalid authorization before idempotency or app-data side effects", async () => {
    const repository = createInMemoryAppDataRepository();
    const claim = vi.fn();
    const payload = mdiPayload({ event_type: "case_processing" });

    const result = await handleMdiWebhook({
      authorization: "Bearer wrong_secret",
      mdiMirrorRepository: createInMemoryMdiWebhookMirrorRepository(repository),
      payload,
      receivedAt: "2026-06-09T12:00:00.000Z",
      secret: mdiSecret(),
      signature: signMdiPayload(payload),
      webhookRepository: {
        claim,
        markFailed: vi.fn(),
        markProcessed: vi.fn(),
      } as unknown as WebhookProcessingRepository,
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      body: { error: "invalid_signature" },
    });
    expect(claim).not.toHaveBeenCalled();
  });

  it("rejects invalid signatures before claiming idempotency or mutating app data", async () => {
    const repository = createInMemoryAppDataRepository();
    const claim = vi.fn();
    const payload = mdiPayload({ event_type: "case_processing" });

    const result = await handleMdiWebhook({
      authorization: "Bearer mdi_authorization_secret",
      mdiMirrorRepository: createInMemoryMdiWebhookMirrorRepository(repository),
      payload,
      receivedAt: "2026-06-09T12:00:00.000Z",
      secret: mdiSecret(),
      signature: signMdiPayload(payload, "wrong_signing_secret"),
      webhookRepository: {
        claim,
        markFailed: vi.fn(),
        markProcessed: vi.fn(),
      } as unknown as WebhookProcessingRepository,
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      body: { error: "invalid_signature" },
    });
    expect(claim).not.toHaveBeenCalled();
  });

  it("accepts generated MDI-shaped payloads without provider event IDs and skips duplicates", async () => {
    const repository = seededMdiRepository("mdi_submitted");
    const payload = mdiPayload({ event_type: "case_processing" });

    const first = await handleMdiWebhook({
      authorization: "mdi_authorization_secret",
      mdiMirrorRepository: createInMemoryMdiWebhookMirrorRepository(repository),
      payload,
      receivedAt: "2026-06-09T12:00:00.000Z",
      secret: mdiSecret(),
      signature: signMdiPayload(payload),
      webhookRepository: createWebhookProcessingRepository(repository),
    });
    const duplicate = await handleMdiWebhook({
      authorization: "mdi_authorization_secret",
      mdiMirrorRepository: createInMemoryMdiWebhookMirrorRepository(repository),
      payload,
      receivedAt: "2026-06-09T12:00:01.000Z",
      secret: mdiSecret(),
      signature: signMdiPayload(payload),
      webhookRepository: createWebhookProcessingRepository(repository),
    });

    expect(first).toMatchObject({ ok: true, status: 200, body: { action: "processed" } });
    expect(duplicate).toMatchObject({ ok: true, status: 200, body: { action: "skipped" } });
    expect(getPatientProfile(repository, cognitoSub)).toMatchObject({
      ok: true,
      value: { onboardingStatus: "clinical_review" },
    });
  });

  it("keeps fallback idempotency stable across MDI signing-secret rotation", async () => {
    const repository = seededMdiRepository("mdi_submitted");
    const payload = mdiPayload({ event_type: "case_processing" });
    const secret = {
      ...mdiSecret(),
      webhookSigningSecret: "mdi_webhook_signing_secret_current",
      webhookSigningSecretPrevious: "mdi_webhook_signing_secret_previous",
      webhookSigningSecretPreviousExpiresAt: "2026-06-09T12:05:00.000Z",
    };

    const first = await handleMdiWebhook({
      authorization: "mdi_authorization_secret",
      mdiMirrorRepository: createInMemoryMdiWebhookMirrorRepository(repository),
      payload,
      receivedAt: "2026-06-09T12:00:00.000Z",
      secret,
      signature: signMdiPayload(payload, "mdi_webhook_signing_secret_previous"),
      webhookRepository: createWebhookProcessingRepository(repository),
    });
    const duplicate = await handleMdiWebhook({
      authorization: "mdi_authorization_secret",
      mdiMirrorRepository: createInMemoryMdiWebhookMirrorRepository(repository),
      payload,
      receivedAt: "2026-06-09T12:00:01.000Z",
      secret,
      signature: signMdiPayload(payload, "mdi_webhook_signing_secret_current"),
      webhookRepository: createWebhookProcessingRepository(repository),
    });

    expect(first).toMatchObject({ ok: true, status: 200, body: { action: "processed" } });
    expect(duplicate).toMatchObject({ ok: true, status: 200, body: { action: "skipped" } });
  });

  it("mirrors ordinary case approval into non-unlocking status evidence only", async () => {
    const repository = seededMdiRepository("clinical_review", "payment_method_collected");
    const payload = mdiPayload({ event_type: "case_approved" });

    const result = await handleMdiWebhook({
      authorization: "Bearer mdi_authorization_secret",
      mdiMirrorRepository: createInMemoryMdiWebhookMirrorRepository(repository),
      payload,
      receivedAt: "2026-06-09T12:00:00.000Z",
      secret: mdiSecret(),
      signature: signMdiPayload(payload),
      webhookRepository: createWebhookProcessingRepository(repository),
    });

    expect(result).toMatchObject({ ok: true, status: 200, body: { action: "processed" } });
    expect(getPatientProfile(repository, cognitoSub)).toMatchObject({
      ok: true,
      value: { onboardingStatus: "clinical_review" },
    });

    const evidence = listEvidenceEventsForPatient(repository, { cognitoSub, limit: 250 });
    const statusEvidence = evidence.ok
      ? evidence.value.items.filter((event) => event.metadata?.side_effect === "mdi_status_update")
      : [];
    expect(statusEvidence).toHaveLength(1);
    expect(statusEvidence[0]).toMatchObject({
      eventCategory: "webhook",
      eventType: "webhook_side_effect_applied",
      mdiCaseId,
      mdiPatientId,
      metadata: { case_status: "approved", side_effect: "mdi_status_update" },
      source: "webhook",
      webhookProvider: "mdi",
    });
    expect(JSON.stringify(evidence)).not.toContain("activate_billing");
    expect(JSON.stringify(evidence)).not.toContain("metadata\":\"");
    expect(JSON.stringify(evidence)).not.toContain("clinical_note");
    expect(JSON.stringify(evidence)).not.toContain("questionnaire");
    expect(JSON.stringify(evidence)).not.toContain("answer");
  });

  it("replays sanitized case lifecycle fixtures into deterministic bounded status evidence", async () => {
    const repository = seededMdiRepository("mdi_submitted", "payment_method_pending");

    for (const event of [
      { event_type: "case_created", timestamp: 1_781_006_000 },
      { event_type: "case_support", timestamp: 1_781_006_100 },
      { event_type: "case_waiting", timestamp: 1_781_006_200 },
      { event_type: "case_assigned", timestamp: 1_781_006_300 },
      { event_type: "case_clinically_approved", timestamp: 1_781_006_400 },
      { event_type: "case_completed", timestamp: 1_781_006_500 },
    ]) {
      const payload = mdiPayload(event);
      const result = await handleMdiWebhook({
        authorization: "mdi_authorization_secret",
        mdiMirrorRepository: createInMemoryMdiWebhookMirrorRepository(repository),
        payload,
        receivedAt: "2026-06-09T12:00:00.000Z",
        secret: mdiSecret(),
        signature: signMdiPayload(payload),
        webhookRepository: createWebhookProcessingRepository(repository),
      });
      expect(result).toMatchObject({ ok: true, status: 200, body: { action: "processed" } });
    }

    expect(getPatientProfile(repository, cognitoSub)).toMatchObject({
      ok: true,
      value: { onboardingStatus: "billing_ready" },
    });
    const evidence = listEvidenceEventsForPatient(repository, { cognitoSub, limit: 250 });
    expect(evidence.ok && evidence.value.items
      .filter((event) => event.metadata?.side_effect === "mdi_status_update")
      .map((event) => event.metadata?.case_status)).toEqual([
        "created",
        "support",
        "waiting",
        "assigned",
        "billing_ready",
        "completed",
      ]);
    expect(JSON.stringify(evidence)).not.toContain("ASSIGNEE_POINTER_SENTINEL");
    expect(JSON.stringify(evidence)).not.toContain("TAG_POINTER_SENTINEL");
  });

  it("does not let stale lifecycle events regress status or evaluate billing", async () => {
    const repository = seededMdiRepository("clinical_review", "payment_method_collected");
    const cancelledPayload = mdiPayload({
      event_type: "case_cancelled",
      timestamp: 1_781_006_500,
    });
    const staleApprovalPayload = mdiPayload({
      event_type: "case_clinically_approved",
      timestamp: 1_781_006_400,
    });

    const cancelled = await handleMdiWebhook({
      authorization: "mdi_authorization_secret",
      mdiMirrorRepository: createInMemoryMdiWebhookMirrorRepository(repository),
      payload: cancelledPayload,
      receivedAt: "2026-06-09T12:00:00.000Z",
      secret: mdiSecret(),
      signature: signMdiPayload(cancelledPayload),
      webhookRepository: createWebhookProcessingRepository(repository),
    });
    const staleApproval = await handleMdiWebhook({
      authorization: "mdi_authorization_secret",
      mdiMirrorRepository: createInMemoryMdiWebhookMirrorRepository(repository),
      payload: staleApprovalPayload,
      receivedAt: "2026-06-09T12:00:01.000Z",
      secret: mdiSecret(),
      signature: signMdiPayload(staleApprovalPayload),
      webhookRepository: createWebhookProcessingRepository(repository),
    });

    expect(cancelled).toMatchObject({ ok: true, status: 200, body: { action: "processed" } });
    expect(staleApproval).toMatchObject({ ok: true, status: 200, body: { action: "processed" } });

    const evidence = listEvidenceEventsForPatient(repository, { cognitoSub });
    expect(evidence.ok && evidence.value.items
      .filter((event) => event.metadata?.side_effect === "mdi_status_update")
      .map((event) => event.metadata?.case_status)).toEqual(["cancelled"]);
    expect(JSON.stringify(evidence)).not.toContain("activate_billing");
  });

  it("uses the current status mirror to reject stale lifecycle races before evidence writes", async () => {
    const repository = seededMdiRepository("clinical_review", "payment_method_collected");
    const staleApprovalPayload = mdiPayload({
      event_type: "case_clinically_approved",
      timestamp: 1_781_006_400,
    });

    expect(repository.put({
      ...mdiCaseStatusMirrorKey(mdiCaseId),
      recordType: "mdiCaseStatusMirror",
      schemaVersion: 1,
      caseStatus: "cancelled",
      cognitoSub,
      createdAt: "2026-06-09T12:00:00.000Z",
      mdiCaseId,
      mdiPatientId,
      providerTimestamp: "2026-06-09T12:01:40.000Z",
      statusRank: 50,
      terminal: true,
      updatedAt: "2026-06-09T12:00:00.000Z",
      webhookEventId: "mdi_evt_concurrent_cancel_001",
    }).ok).toBe(true);

    const staleApproval = await handleMdiWebhook({
      authorization: "mdi_authorization_secret",
      mdiMirrorRepository: createInMemoryMdiWebhookMirrorRepository(repository),
      payload: staleApprovalPayload,
      receivedAt: "2026-06-09T12:00:01.000Z",
      secret: mdiSecret(),
      signature: signMdiPayload(staleApprovalPayload),
      webhookRepository: createWebhookProcessingRepository(repository),
    });

    expect(staleApproval).toMatchObject({ ok: true, status: 200, body: { action: "processed" } });
    const evidence = listEvidenceEventsForPatient(repository, { cognitoSub });
    expect(evidence.ok && evidence.value.items
      .filter((event) => event.metadata?.side_effect === "mdi_status_update")).toEqual([]);
    expect(JSON.stringify(evidence)).not.toContain("activate_billing");
  });

  it("records case-scoped activate billing decision exactly once when T-078 permits it", async () => {
    const repository = seededMdiRepository("clinical_review", "payment_method_collected");
    const firstPayload = mdiPayload({
      event_type: "case_clinically_approved",
      timestamp: 1_781_006_400,
    });
    const secondPayload = mdiPayload({
      event_type: "case_clinically_approved",
      timestamp: 1_781_006_500,
    });

    for (const payload of [firstPayload, secondPayload]) {
      const result = await handleMdiWebhook({
        authorization: "mdi_authorization_secret",
        mdiMirrorRepository: createInMemoryMdiWebhookMirrorRepository(repository),
        payload,
        receivedAt: "2026-06-09T12:00:00.000Z",
        secret: mdiSecret(),
        signature: signMdiPayload(payload),
        webhookRepository: createWebhookProcessingRepository(repository),
      });
      expect(result).toMatchObject({ ok: true, status: 200, body: { action: "processed" } });
    }

    const evidence = listEvidenceEventsForPatient(repository, { cognitoSub });
    const activationDecisions = evidence.ok
      ? evidence.value.items.filter((event) =>
        event.eventType === "mdi_billing_unlock_decision" &&
        event.metadata?.billing_action === "activate_billing"
      )
      : [];
    expect(activationDecisions).toHaveLength(1);
    expect(activationDecisions[0]).toMatchObject({
      eventCategory: "mdi_handoff",
      eventId: `mdi:billing_unlock:${mdiCaseId}:activate_billing`,
      metadata: {
        billing_action: "activate_billing",
        billing_reason: "selected_unlock_event",
      },
      source: "webhook",
      status: "recorded",
    });
  });

  it("recovers billing decision on retry when status evidence already exists", async () => {
    const repository = seededMdiRepository("clinical_review", "payment_method_collected");
    const payload = mdiPayload({ event_type: "case_clinically_approved" });
    const webhookRepository = createWebhookProcessingRepository(repository);

    const first = await handleMdiWebhook({
      authorization: "mdi_authorization_secret",
      mdiMirrorRepository: {
        ...createInMemoryMdiWebhookMirrorRepository(repository),
        async getStripeLinkage() {
          return appDataError("retryable_client_failure");
        },
      },
      payload,
      receivedAt: "2026-06-09T12:00:00.000Z",
      secret: mdiSecret(),
      signature: signMdiPayload(payload),
      webhookRepository,
    });
    const retry = await handleMdiWebhook({
      authorization: "mdi_authorization_secret",
      mdiMirrorRepository: createInMemoryMdiWebhookMirrorRepository(repository),
      payload,
      receivedAt: "2026-06-09T12:10:00.000Z",
      secret: mdiSecret(),
      signature: signMdiPayload(payload),
      webhookRepository,
    });

    expect(first).toEqual({ ok: false, status: 409, body: { error: "retry_later" } });
    expect(retry).toMatchObject({ ok: true, status: 200, body: { action: "processed" } });

    const evidence = listEvidenceEventsForPatient(repository, { cognitoSub });
    const activationDecisions = evidence.ok
      ? evidence.value.items.filter((event) =>
        event.eventType === "mdi_billing_unlock_decision" &&
        event.metadata?.billing_action === "activate_billing"
      )
      : [];
    expect(activationDecisions).toHaveLength(1);
  });

  it("uses paginated case evidence so a later terminal status prevents stale approval", async () => {
    const repository = seededMdiRepository("clinical_review", "payment_method_collected");
    for (let index = 0; index < 105; index += 1) {
      seedStatusEvidence(repository, {
        occurredAt: `2026-06-09T11:${String(index % 50).padStart(2, "0")}:00.000Z`,
        status: "processing",
        webhookEventId: `mdi_evt_history_${String(index).padStart(3, "0")}`,
      });
    }
    seedStatusEvidence(repository, {
      occurredAt: "2026-06-09T12:20:00.000Z",
      status: "cancelled",
      webhookEventId: "mdi_evt_terminal_001",
    });
    const staleApprovalPayload = mdiPayload({
      event_type: "case_clinically_approved",
      timestamp: 1_781_007_000,
    });

    const result = await handleMdiWebhook({
      authorization: "mdi_authorization_secret",
      mdiMirrorRepository: createInMemoryMdiWebhookMirrorRepository(repository),
      payload: staleApprovalPayload,
      receivedAt: "2026-06-09T12:30:00.000Z",
      secret: mdiSecret(),
      signature: signMdiPayload(staleApprovalPayload),
      webhookRepository: createWebhookProcessingRepository(repository),
    });

    expect(result).toMatchObject({ ok: true, status: 200, body: { action: "processed" } });
    const caseEvidence = await createInMemoryMdiWebhookMirrorRepository(repository)
      .listEvidenceEventsForMdiCase({ cognitoSub, mdiCaseId });
    expect(JSON.stringify(caseEvidence)).not.toContain("activate_billing");
    const statusCodes = caseEvidence.ok
      ? caseEvidence.value
        .filter((event) => event.metadata?.side_effect === "mdi_status_update")
        .map((event) => event.metadata?.case_status)
      : [];
    expect(statusCodes).toContain("cancelled");
    expect(statusCodes).not.toContain("billing_ready");
  });

  it("treats equal-timestamp terminal status as current before evaluating billing", async () => {
    const repository = seededMdiRepository("clinical_review", "payment_method_collected");
    seedStatusEvidence(repository, {
      occurredAt: "2026-06-09T12:20:00.000Z",
      status: "processing",
      webhookEventId: "mdi_evt_aaa_same_time_processing",
    });
    seedStatusEvidence(repository, {
      occurredAt: "2026-06-09T12:20:00.000Z",
      status: "cancelled",
      webhookEventId: "mdi_evt_zzz_same_time_cancelled",
    });
    const sameTimestampApprovalPayload = mdiPayload({
      event_type: "case_clinically_approved",
      timestamp: 1_781_007_600,
    });

    const result = await handleMdiWebhook({
      authorization: "mdi_authorization_secret",
      mdiMirrorRepository: createInMemoryMdiWebhookMirrorRepository(repository),
      payload: sameTimestampApprovalPayload,
      receivedAt: "2026-06-09T12:20:00.000Z",
      secret: mdiSecret(),
      signature: signMdiPayload(sameTimestampApprovalPayload),
      webhookRepository: createWebhookProcessingRepository(repository),
    });

    expect(result).toMatchObject({ ok: true, status: 200, body: { action: "processed" } });
    const caseEvidence = await createInMemoryMdiWebhookMirrorRepository(repository)
      .listEvidenceEventsForMdiCase({ cognitoSub, mdiCaseId });
    expect(JSON.stringify(caseEvidence)).not.toContain("activate_billing");
    const statusCodes = caseEvidence.ok
      ? caseEvidence.value
        .filter((event) => event.metadata?.side_effect === "mdi_status_update")
        .map((event) => event.metadata?.case_status)
      : [];
    expect(statusCodes).toEqual(["processing", "cancelled"]);
  });

  it.each([
    "not_started",
    "payment_method_pending",
    "past_due",
    "canceled",
    undefined,
  ] as const)("fails closed for %s billing state on clinical approval", async (billingStatus) => {
    const repository = seededMdiRepository("clinical_review", billingStatus);
    const payload = mdiPayload({ event_type: "case_clinically_approved" });

    const result = await handleMdiWebhook({
      authorization: "mdi_authorization_secret",
      mdiMirrorRepository: createInMemoryMdiWebhookMirrorRepository(repository),
      payload,
      receivedAt: "2026-06-09T12:00:00.000Z",
      secret: mdiSecret(),
      signature: signMdiPayload(payload),
      webhookRepository: createWebhookProcessingRepository(repository),
    });

    expect(result).toMatchObject({ ok: true, status: 200, body: { action: "processed" } });
    const evidence = listEvidenceEventsForPatient(repository, { cognitoSub });
    expect(JSON.stringify(evidence)).not.toContain("activate_billing");
    expect(evidence.ok && evidence.value.items).toContainEqual(expect.objectContaining({
      eventType: "mdi_billing_unlock_decision",
      metadata: {
        billing_action: "await_payment_method",
        billing_reason: "payment_method_not_collected",
      },
      status: "skipped",
    }));
    if (billingStatus !== undefined) {
      expect(getStripeLinkage(repository, cognitoSub)).toMatchObject({
        ok: true,
        value: { billingStatus },
      });
    }
  });

  it("records message dashboard cues without storing message content", async () => {
    const repository = seededMdiRepository("mdi_submitted");
    const payload = mdiPayload({
      case_id: undefined,
      channel: "patient_app",
      content: "PATIENT_MESSAGE_BODY_SENTINEL",
      event_type: "message_created",
      message_id: "mdi_message_opaque_001",
      patient_id: mdiPatientId,
      subject: "PATIENT_MESSAGE_SUBJECT_SENTINEL",
      user_type: "clinician",
    });

    const result = await handleMdiWebhook({
      authorization: "mdi_authorization_secret",
      mdiMirrorRepository: createInMemoryMdiWebhookMirrorRepository(repository),
      payload,
      receivedAt: "2026-06-09T12:00:00.000Z",
      secret: mdiSecret(),
      signature: signMdiPayload(payload),
      webhookRepository: createWebhookProcessingRepository(repository),
    });

    expect(result).toMatchObject({ ok: true, status: 200, body: { action: "processed" } });
    expect(getPatientProfile(repository, cognitoSub)).toMatchObject({
      ok: true,
      value: { onboardingStatus: "mdi_submitted" },
    });
    const evidence = listEvidenceEventsForPatient(repository, { cognitoSub });
    expect(evidence).toMatchObject({
      ok: true,
      value: {
        items: [
          {
            eventCategory: "mdi_handoff",
            eventType: "mdi_dashboard_cue_recorded",
            eventId: expect.stringContaining(":patient:"),
            mdiPatientId,
            metadata: {
              cue_action: "open_mdi",
              cue_code: "open_mdi_messages",
              cue_family: "message",
            },
            status: "recorded",
          },
        ],
      },
    });
    expect(JSON.stringify(evidence)).toContain("mdi_message_opaque_001");
    expect(JSON.stringify(evidence)).not.toContain("PATIENT_MESSAGE_BODY_SENTINEL");
    expect(JSON.stringify(evidence)).not.toContain("PATIENT_MESSAGE_SUBJECT_SENTINEL");
  });

  it("uses cue pointers so same-timestamp messages do not collide", async () => {
    const repository = seededMdiRepository("mdi_submitted");
    const webhookRepository = createWebhookProcessingRepository(repository);

    for (const messageId of ["mdi_message_opaque_001", "mdi_message_opaque_002"]) {
      const payload = mdiPayload({
        case_id: undefined,
        event_type: "message_created",
        message_id: messageId,
        patient_id: mdiPatientId,
        timestamp: 1_781_006_400,
      });
      const result = await handleMdiWebhook({
        authorization: "mdi_authorization_secret",
        mdiMirrorRepository: createInMemoryMdiWebhookMirrorRepository(repository),
        payload,
        receivedAt: "2026-06-09T12:00:00.000Z",
        secret: mdiSecret(),
        signature: signMdiPayload(payload),
        webhookRepository,
      });
      expect(result).toMatchObject({ ok: true, status: 200, body: { action: "processed" } });
    }

    const evidence = listEvidenceEventsForPatient(repository, { cognitoSub, limit: 250 });
    const cues = evidence.ok
      ? evidence.value.items.filter((event) => event.eventType === "mdi_dashboard_cue_recorded")
      : [];
    expect(cues.map((event) => event.eventId)).toHaveLength(2);
    expect(new Set(cues.map((event) => event.eventId)).size).toBe(2);
    expect(JSON.stringify(evidence)).toContain("mdi_message_opaque_001");
    expect(JSON.stringify(evidence)).toContain("mdi_message_opaque_002");
  });

  it("records file and lab cues without storing file metadata or access links", async () => {
    const repository = seededMdiRepository("mdi_submitted");
    for (const event of [
      {
        access_link: "https://mdi.example/access-link-sentinel",
        event_type: "file_upload_requested",
        metadata: "FILE_UPLOAD_METADATA_SENTINEL",
      },
      {
        event_type: "case_file_added",
        file_id: "mdi_file_opaque_001",
        metadata: "FILE_METADATA_SENTINEL",
      },
      {
        event_type: "file_lab_results_processed",
        file_id: "mdi_file_opaque_002",
        file_type: "LAB_RESULT_SENTINEL",
        status: "LAB_STATUS_SENTINEL",
      },
      {
        event_type: "case_file_deleted",
        file_id: "mdi_file_opaque_001",
        metadata: "FILE_DELETE_METADATA_SENTINEL",
      },
    ]) {
      const payload = mdiPayload(event);
      const result = await handleMdiWebhook({
        authorization: "mdi_authorization_secret",
        mdiMirrorRepository: createInMemoryMdiWebhookMirrorRepository(repository),
        payload,
        receivedAt: "2026-06-09T12:00:00.000Z",
        secret: mdiSecret(),
        signature: signMdiPayload(payload),
        webhookRepository: createWebhookProcessingRepository(repository),
      });
      expect(result).toMatchObject({ ok: true, status: 200, body: { action: "processed" } });
    }

    const evidence = listEvidenceEventsForPatient(repository, { cognitoSub, limit: 250 });
    expect(evidence.ok && evidence.value.items
      .filter((event) => event.eventType === "mdi_dashboard_cue_recorded")
      .map((event) => event.metadata?.cue_code)
      .sort()).toEqual([
        "file_action_needed",
        "files_unavailable",
        "open_mdi_files",
        "open_mdi_files",
      ].sort());
    expect(JSON.stringify(evidence)).toContain("mdi_file_opaque_001");
    expect(JSON.stringify(evidence)).not.toContain("access-link-sentinel");
    expect(JSON.stringify(evidence)).not.toContain("FILE_METADATA_SENTINEL");
    expect(JSON.stringify(evidence)).not.toContain("LAB_RESULT_SENTINEL");
    expect(JSON.stringify(evidence)).not.toContain("LAB_STATUS_SENTINEL");
  });

  it("records voucher cue status with opaque voucher IDs only", async () => {
    const repository = seededMdiRepository("mdi_submitted");
    for (const event of [
      { event_type: "voucher_created", voucher_id: "mdi_voucher_opaque_001" },
      { event_type: "voucher_used", voucher_id: "mdi_voucher_opaque_001", metadata: "VOUCHER_METADATA_SENTINEL" },
    ]) {
      const payload = mdiPayload(event);
      const result = await handleMdiWebhook({
        authorization: "mdi_authorization_secret",
        mdiMirrorRepository: createInMemoryMdiWebhookMirrorRepository(repository),
        payload,
        receivedAt: "2026-06-09T12:00:00.000Z",
        secret: mdiSecret(),
        signature: signMdiPayload(payload),
        webhookRepository: createWebhookProcessingRepository(repository),
      });
      expect(result).toMatchObject({ ok: true, status: 200, body: { action: "processed" } });
    }

    const evidence = listEvidenceEventsForPatient(repository, { cognitoSub, limit: 250 });
    const cues = evidence.ok
      ? evidence.value.items.filter((event) => event.eventType === "mdi_dashboard_cue_recorded")
      : [];
    expect(cues.map((event) => event.metadata)).toEqual([
      {
        cue_action: "status_available",
        cue_code: "benefit_status_pending",
        cue_family: "voucher",
      },
      {
        cue_action: "noop",
        cue_code: "cue_noop",
        cue_family: "voucher",
      },
    ]);
    expect(cues.map((event) => event.status)).toEqual(["recorded", "skipped"]);
    expect(JSON.stringify(evidence)).toContain("mdi_voucher_opaque_001");
    expect(JSON.stringify(evidence)).not.toContain("VOUCHER_METADATA_SENTINEL");
  });

  it("replays sanitized partner charge fixtures into bounded case evidence exactly once", async () => {
    const repository = seededChargeFixtureRepository();
    const webhookRepository = createWebhookProcessingRepository(repository);

    for (const event of caseChargeEvents.events) {
      for (let index = 0; index < 2; index += 1) {
        const payload = mdiChargePayload(event);
        const result = await handleMdiWebhook({
          authorization: "mdi_authorization_secret",
          mdiMirrorRepository: createInMemoryMdiWebhookMirrorRepository(repository),
          payload,
          receivedAt: event.occurredAt,
          secret: mdiSecret(),
          signature: signMdiPayload(payload),
          webhookRepository,
        });
        expect(result).toMatchObject({
          ok: true,
          status: 200,
          body: { action: index === 0 ? "processed" : "skipped" },
        });
      }
    }

    const evidence = listEvidenceEventsForPatient(repository, { cognitoSub: chargeFixtureCognitoSub, limit: 250 });
    const charges = evidence.ok
      ? evidence.value.items.filter((event) => event.eventType === "mdi_partner_charge_recorded")
      : [];
    expect(charges).toHaveLength(2);
    expect(charges.map((event) => event.metadata)).toEqual([
      {
        amount_cents: "1000",
        charge_code: "partner_additional_charge",
        currency: "usd",
        fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
        reference_type: "charge",
      },
      {
        amount_cents: "2500",
        charge_code: "vouched_amount_charge",
        currency: "usd",
        fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
        reference_type: "voucher",
      },
    ]);
    for (const event of charges) {
      expect(Object.keys(event.metadata ?? {}).sort()).toEqual(
        event.metadata?.reference_type
          ? ["amount_cents", "charge_code", "currency", "fingerprint", "reference_type"]
          : ["amount_cents", "charge_code", "currency", "fingerprint"],
      );
      expect(event.eventCategory).toBe("mdi_handoff");
      expect(event.status).toBe("recorded");
      expect(event.source).toBe("webhook");
      expect(event.webhookProvider).toBeUndefined();
      expect(event.webhookEventId).toBeUndefined();
    }
    expect(JSON.stringify(evidence)).not.toContain("chargeReferenceId");
    expect(JSON.stringify(evidence)).not.toContain("voucherId");
    expect(JSON.stringify(evidence)).not.toContain("questionnaire");
    expect(JSON.stringify(evidence)).not.toContain("prescription");
    expect(JSON.stringify(evidence)).not.toContain("medication");
  });

  it("keeps missing local charge case linkage retryable without charge evidence", async () => {
    const repository = createInMemoryAppDataRepository([
      createPatientProfileRecord({
        cognitoSub: chargeFixtureCognitoSub,
        onboardingStatus: "mdi_submitted",
        now: "2026-06-05T12:00:00.000Z",
      }),
    ]);
    const event = caseChargeEvents.events[0];
    const payload = mdiChargePayload(event);

    const result = await handleMdiWebhook({
      authorization: "mdi_authorization_secret",
      mdiMirrorRepository: createInMemoryMdiWebhookMirrorRepository(repository),
      payload,
      receivedAt: event.occurredAt,
      secret: mdiSecret(),
      signature: signMdiPayload(payload),
      webhookRepository: createWebhookProcessingRepository(repository),
    });

    expect(result).toEqual({ ok: false, status: 409, body: { error: "retry_later" } });
    const evidence = listEvidenceEventsForPatient(repository, { cognitoSub: chargeFixtureCognitoSub, limit: 250 });
    expect(evidence).toMatchObject({ ok: true, value: { items: [] } });
    expect(JSON.stringify(evidence)).not.toContain("partner_additional_charge");
  });

  it.each([
    ["fractional cents", { amountCents: 1000.5 }],
    ["zero cents", { amountCents: 0 }],
    ["missing provider event ID", { eventId: undefined }],
    ["missing currency", { currency: undefined }],
    ["unsupported currency", { currency: "eur" }],
    ["unsafe charge reference", { chargeReferenceId: "mdi_charge_medication_name" }],
    ["ambiguous decimal precision", { amountCents: undefined, charge_amount: "10.999" }],
  ])("fails closed for invalid partner charge payloads: %s", async (_label, overrides) => {
    const repository = seededChargeFixtureRepository();
    const claim = vi.fn();
    const event = caseChargeEvents.events[0];
    const payload = mdiChargePayload(event, overrides);

    const result = await handleMdiWebhook({
      authorization: "mdi_authorization_secret",
      mdiMirrorRepository: createInMemoryMdiWebhookMirrorRepository(repository),
      payload,
      receivedAt: event.occurredAt,
      secret: mdiSecret(),
      signature: signMdiPayload(payload),
      webhookRepository: {
        claim,
        markFailed: vi.fn(),
        markProcessed: vi.fn(),
      } as unknown as WebhookProcessingRepository,
    });

    expect(result).toEqual({ ok: false, status: 400, body: { error: "invalid_payload" } });
    expect(claim).not.toHaveBeenCalled();
  });

  it.each([
    ["charge product", 0, { chargeReferenceId: "mdi_charge_product_name" }],
    ["charge prescription", 0, { chargeReferenceId: "mdi_charge_prescription_detail" }],
    ["voucher product", 1, { voucherId: "mdi_voucher_product_name" }],
    ["voucher prescription", 1, { voucherId: "mdi_voucher_prescription_detail" }],
  ] as const)("fails closed for unsafe charge reference vocabulary: %s", async (_label, eventIndex, overrides) => {
    const repository = seededChargeFixtureRepository();
    const claim = vi.fn();
    const event = caseChargeEvents.events[eventIndex];
    const payload = mdiChargePayload(event, overrides);

    const result = await handleMdiWebhook({
      authorization: "mdi_authorization_secret",
      mdiMirrorRepository: createInMemoryMdiWebhookMirrorRepository(repository),
      payload,
      receivedAt: event.occurredAt,
      secret: mdiSecret(),
      signature: signMdiPayload(payload),
      webhookRepository: {
        claim,
        markFailed: vi.fn(),
        markProcessed: vi.fn(),
      } as unknown as WebhookProcessingRepository,
    });

    expect(result).toEqual({ ok: false, status: 400, body: { error: "invalid_payload" } });
    expect(claim).not.toHaveBeenCalled();
  });

  it("fails closed when a duplicate partner charge event has a different bounded fingerprint", async () => {
    const repository = seededChargeFixtureRepository();
    const webhookRepository = createWebhookProcessingRepository(repository);
    const event = caseChargeEvents.events[0];
    const firstPayload = mdiChargePayload(event);
    const conflictingPayload = mdiChargePayload(event, { amountCents: 1100 });

    const first = await handleMdiWebhook({
      authorization: "mdi_authorization_secret",
      mdiMirrorRepository: createInMemoryMdiWebhookMirrorRepository(repository),
      payload: firstPayload,
      receivedAt: event.occurredAt,
      secret: mdiSecret(),
      signature: signMdiPayload(firstPayload),
      webhookRepository,
    });
    const conflict = await handleMdiWebhook({
      authorization: "mdi_authorization_secret",
      mdiMirrorRepository: createInMemoryMdiWebhookMirrorRepository(repository),
      payload: conflictingPayload,
      receivedAt: event.occurredAt,
      secret: mdiSecret(),
      signature: signMdiPayload(conflictingPayload),
      webhookRepository,
    });

    expect(first).toMatchObject({ ok: true, status: 200, body: { action: "processed" } });
    expect(conflict).toMatchObject({ ok: true, status: 200, body: { action: "terminal_failed" } });
    const evidence = listEvidenceEventsForPatient(repository, { cognitoSub: chargeFixtureCognitoSub, limit: 250 });
    const charges = evidence.ok
      ? evidence.value.items.filter((event) => event.eventType === "mdi_partner_charge_recorded")
      : [];
    expect(charges).toHaveLength(1);
    expect(charges[0].metadata).toMatchObject({ amount_cents: "1000" });
    expect(JSON.stringify(evidence)).not.toContain("1100");
  });

  it("terminally no-ops signed preferred pharmacy request payloads without storing raw body", async () => {
    const repository = seededMdiRepository("mdi_submitted");
    const payload = "preferred_pharmacy_request=redacted";
    const webhookRepository = createWebhookProcessingRepository(repository);

    const first = await handleMdiWebhook({
      authorization: "mdi_authorization_secret",
      mdiMirrorRepository: createInMemoryMdiWebhookMirrorRepository(repository),
      payload,
      receivedAt: "2026-06-09T12:00:00.000Z",
      secret: mdiSecret(),
      signature: signMdiPayload(payload),
      webhookRepository,
    });
    const duplicate = await handleMdiWebhook({
      authorization: "mdi_authorization_secret",
      mdiMirrorRepository: createInMemoryMdiWebhookMirrorRepository(repository),
      payload,
      receivedAt: "2026-06-09T12:00:01.000Z",
      secret: mdiSecret(),
      signature: signMdiPayload(payload),
      webhookRepository,
    });

    expect(first).toMatchObject({ ok: true, status: 200, body: { action: "processed" } });
    expect(duplicate).toMatchObject({ ok: true, status: 200, body: { action: "skipped" } });
    expect(getPatientProfile(repository, cognitoSub)).toMatchObject({
      ok: true,
      value: { onboardingStatus: "mdi_submitted" },
    });
    const evidence = listEvidenceEventsForPatient(repository, { cognitoSub });
    expect(evidence).toMatchObject({ ok: true, value: { items: [] } });
    expect(JSON.stringify(evidence)).not.toContain(payload);
  });

  it("returns non-200 for retryable inline failures that cannot be replayed generically", async () => {
    const repository = seededMdiRepository("mdi_submitted");
    const payload = mdiPayload({ event_type: "case_processing" });

    const result = await handleMdiWebhook({
      authorization: "mdi_authorization_secret",
      mdiMirrorRepository: {
        ...createInMemoryMdiWebhookMirrorRepository(repository),
        async findPatientByMdiCase() {
          return appDataError("retryable_client_failure");
        },
      },
      payload,
      receivedAt: "2026-06-09T12:00:00.000Z",
      secret: mdiSecret(),
      signature: signMdiPayload(payload),
      webhookRepository: createWebhookProcessingRepository(repository),
    });

    expect(result).toEqual({
      ok: false,
      status: 409,
      body: { error: "retry_later" },
    });
  });

  it("does not acknowledge thrown provider-owned failures as processed or queued", async () => {
    const repository = seededMdiRepository("mdi_submitted");
    const payload = mdiPayload({ event_type: "case_processing" });

    const result = await handleMdiWebhook({
      authorization: "mdi_authorization_secret",
      mdiMirrorRepository: {
        ...createInMemoryMdiWebhookMirrorRepository(repository),
        async findPatientByMdiCase() {
          throw new Error("dynamodb throttled");
        },
      },
      payload,
      receivedAt: "2026-06-09T12:00:00.000Z",
      secret: mdiSecret(),
      signature: signMdiPayload(payload),
      webhookRepository: createWebhookProcessingRepository(repository),
    });

    expect(result).toEqual({
      ok: false,
      status: 409,
      body: { error: "retry_later" },
    });
  });

  it("keeps provider retry active beyond the shared webhook default attempt limit", async () => {
    const repository = seededMdiRepository("mdi_submitted");
    const payload = mdiPayload({ event_type: "case_processing" });
    const webhookRepository = createWebhookProcessingRepository(repository);
    const attempts = [];

    for (let index = 0; index < 4; index += 1) {
      attempts.push(await handleMdiWebhook({
        authorization: "mdi_authorization_secret",
        mdiMirrorRepository: {
          ...createInMemoryMdiWebhookMirrorRepository(repository),
          async findPatientByMdiCase() {
            return appDataError("retryable_client_failure");
          },
        },
        payload,
        receivedAt: `2026-06-09T12:00:0${index}.000Z`,
        secret: mdiSecret(),
        signature: signMdiPayload(payload),
        webhookRepository,
      }));
    }

    expect(attempts).toEqual([
      { ok: false, status: 409, body: { error: "retry_later" } },
      { ok: false, status: 409, body: { error: "retry_later" } },
      { ok: false, status: 409, body: { error: "retry_later" } },
      { ok: false, status: 409, body: { error: "retry_later" } },
    ]);
  });

  it("registers every generated JSON webhook event type in the event contract", () => {
    expect(mdiWebhookEventContracts.map((contract) => contract.type).sort()).toEqual([
      "case_approved",
      "case_assigned",
      "case_assigned_to_clinician",
      "case_cancelled",
      "case_clinically_approved",
      "case_completed",
      "case_created",
      "case_declined",
      "case_file_added",
      "case_file_deleted",
      "case_processing",
      "case_support",
      "case_tag_added",
      "case_tag_attached",
      "case_transferred_to_support",
      "case_waiting",
      "clinical_note_created",
      "drivers_license_requested",
      "exam_requested",
      "file_lab_results_processed",
      "file_upload_requested",
      "intro_video_requested",
      "medical_necessity_file_generated",
      "message_created",
      "notification_sent",
      "offering_submitted",
      "order_status_changed",
      "order_tracking_number_changed",
      "partner_additional_charge",
      "partner_charge",
      "patient_created",
      "patient_deleted",
      "patient_insurance_coverage_updated",
      "patient_modified",
      "patient_opt_out",
      "patient_tag_attached",
      "preferred_pharmacy_requested",
      "prescription_insurance_coverage_updated",
      "vouched_amount_charge",
      "voucher_created",
      "voucher_expired",
      "voucher_reminder_sent",
      "voucher_updated",
      "voucher_used",
    ]);
  });
});

const cognitoSub = "cognito-sub-0123456789abcdef";
const rawMdiPatientId = "123e4567-e89b-12d3-a456-426614174000";
const rawMdiCaseId = "123e4567-e89b-12d3-a456-426614174111";
const mdiPatientId = "mdi_patient_123e4567e89b12d3a456426614174000";
const mdiCaseId = "mdi_case_123e4567e89b12d3a456426614174111";
const chargeFixtureCognitoSub = "cognito-sub-charge0123456789abcdef";

function seededMdiRepository(
  onboardingStatus: "mdi_submitted" | "clinical_review",
  billingStatus?: BillingStatus,
) {
  const repository = createInMemoryAppDataRepository([
    createPatientProfileRecord({
      cognitoSub,
      onboardingStatus,
      now: "2026-06-09T11:00:00.000Z",
    }),
  ]);
  const linked = linkMdiPatientCase(repository, {
    cognitoSub,
    mdiCaseId,
    mdiPatientId,
    now: "2026-06-09T11:00:00.000Z",
  });
  expect(linked.ok).toBe(true);
  if (billingStatus !== undefined) {
    const stripe = linkStripeCustomer(repository, {
      billingStatus,
      cognitoSub,
      now: "2026-06-09T11:00:00.000Z",
      stripeCustomerId: "cus_opaque_123",
      stripeSubscriptionId: billingStatus === "active" ? "sub_opaque_123" : undefined,
    });
    expect(stripe.ok).toBe(true);
  }
  return repository;
}

function seededChargeFixtureRepository() {
  const firstEvent = caseChargeEvents.events[0];
  const repository = createInMemoryAppDataRepository([
    createPatientProfileRecord({
      cognitoSub: chargeFixtureCognitoSub,
      onboardingStatus: "mdi_submitted",
      now: "2026-06-05T12:00:00.000Z",
    }),
  ]);
  const linked = linkMdiPatientCase(repository, {
    cognitoSub: chargeFixtureCognitoSub,
    mdiCaseId: canonicalFixtureMdiId(firstEvent.mdiCaseId, "mdi_case"),
    mdiPatientId: canonicalFixtureMdiId(firstEvent.mdiPatientId, "mdi_patient"),
    now: "2026-06-05T12:00:00.000Z",
  });
  expect(linked.ok).toBe(true);
  return repository;
}

function mdiPayload(overrides: Record<string, unknown> = {}) {
  return JSON.stringify(withoutUndefined({
    case_id: rawMdiCaseId,
    event_type: "case_processing",
    metadata: "redacted",
    patient_id: rawMdiPatientId,
    timestamp: 1_781_006_400,
    ...overrides,
  }));
}

function mdiChargePayload(
  event: typeof caseChargeEvents.events[number],
  overrides: Record<string, unknown> = {},
) {
  return JSON.stringify(withoutUndefined({
    amountCents: event.amountCents,
    case_id: event.mdiCaseId,
    chargeReferenceId: "chargeReferenceId" in event ? event.chargeReferenceId : undefined,
    currency: event.currency,
    eventId: event.eventId,
    event_type: event.type,
    patient_id: event.mdiPatientId,
    timestamp: Math.floor(Date.parse(event.occurredAt) / 1000),
    voucherId: "voucherId" in event ? event.voucherId : undefined,
    ...overrides,
  }));
}

function canonicalFixtureMdiId(value: string, prefix: "mdi_case" | "mdi_patient") {
  const uuid = value.startsWith(`${prefix}_`) ? value.slice(`${prefix}_`.length) : value;
  return `${prefix}_${uuid.replaceAll("-", "").toLowerCase()}`;
}

function signMdiPayload(payload: string, secret = "mdi_webhook_signing_secret") {
  return `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
}

function mdiSecret() {
  return {
    webhookAuthorizationSecret: "mdi_authorization_secret",
    webhookSigningSecret: "mdi_webhook_signing_secret",
  };
}

function appDataError(kind: AppDataError["kind"]) {
  return {
    ok: false as const,
    error: {
      kind,
      message: "simulated app-data failure",
    },
  };
}

function seedStatusEvidence(
  repository: ReturnType<typeof createInMemoryAppDataRepository>,
  input: {
    occurredAt: string;
    status: "cancelled" | "processing";
    webhookEventId: string;
  },
) {
  const recorded = recordEvidenceEvent(repository, {
    actorType: "vendor",
    cognitoSub,
    eventCategory: "webhook",
    eventId: createWebhookEvidenceEventId(
      "mdi",
      input.webhookEventId,
      "WEBHOOK_SIDE_EFFECT_APPLIED",
      "mdi_status_update",
    ),
    eventType: "webhook_side_effect_applied",
    occurredAt: input.occurredAt,
    recordedAt: input.occurredAt,
    mdiCaseId,
    mdiPatientId,
    metadata: { case_status: input.status, side_effect: "mdi_status_update" },
    source: "webhook",
    status: "succeeded",
    summaryCode: "WEBHOOK_SIDE_EFFECT_APPLIED",
    webhookEventId: input.webhookEventId,
    webhookProvider: "mdi",
  });
  expect(recorded.ok).toBe(true);
}

function withoutUndefined(input: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
}
