import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  createInMemoryAppDataRepository,
  createPatientProfileRecord,
  getPatientProfile,
  linkMdiPatientCase,
  listEvidenceEventsForPatient,
  type AppDataError,
} from "@/lib/dynamodb/app-data";
import {
  createInMemoryMdiWebhookMirrorRepository,
  handleMdiWebhook,
  mdiWebhookEventContracts,
} from "@/lib/mdi-webhooks";
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

  it("mirrors launch-safe case approval into minimal status and webhook evidence only", async () => {
    const repository = seededMdiRepository("clinical_review");
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
      value: { onboardingStatus: "billing_ready" },
    });

    const evidence = listEvidenceEventsForPatient(repository, { cognitoSub });
    expect(evidence.ok && evidence.value.items).toHaveLength(1);
    expect(evidence.ok && evidence.value.items[0]).toMatchObject({
      eventCategory: "webhook",
      eventType: "webhook_side_effect_applied",
      mdiCaseId,
      mdiPatientId,
      metadata: { side_effect: "mdi_status_update" },
      source: "webhook",
      webhookProvider: "mdi",
    });
    expect(JSON.stringify(evidence)).not.toContain("metadata\":\"");
    expect(JSON.stringify(evidence)).not.toContain("clinical_note");
    expect(JSON.stringify(evidence)).not.toContain("questionnaire");
    expect(JSON.stringify(evidence)).not.toContain("answer");
  });

  it("terminally no-ops safe-to-ignore launch events after idempotency processing", async () => {
    const repository = seededMdiRepository("mdi_submitted");
    const payload = mdiPayload({
      case_id: undefined,
      event_type: "message_created",
      message_id: "mdi_message_opaque_001",
      patient_id: mdiPatientId,
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
    expect(listEvidenceEventsForPatient(repository, { cognitoSub })).toMatchObject({
      ok: true,
      value: { items: [] },
    });
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
      "case_assigned_to_clinician",
      "case_cancelled",
      "case_clinically_approved",
      "case_completed",
      "case_created",
      "case_file_added",
      "case_file_deleted",
      "case_processing",
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
      "partner_charge",
      "patient_created",
      "patient_deleted",
      "patient_insurance_coverage_updated",
      "patient_modified",
      "patient_opt_out",
      "patient_tag_attached",
      "preferred_pharmacy_requested",
      "prescription_insurance_coverage_updated",
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

function seededMdiRepository(onboardingStatus: "mdi_submitted" | "clinical_review") {
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

function withoutUndefined(input: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
}
