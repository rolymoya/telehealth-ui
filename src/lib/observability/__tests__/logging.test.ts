import { describe, expect, it } from "vitest";
import {
  circularLogValue,
  createStructuredLogEvent,
  redactForLog,
  redactedLogValue,
  truncatedLogValue,
  writeStructuredLog,
} from "../logging";

describe("PHI-safe structured logging", () => {
  it("redacts questionnaire answers and condition-specific health context", () => {
    const log = createStructuredLogEvent({
      event: "intake_submission_rejected",
      level: "warn",
      provider: "mdi",
      outcome: "rejected",
      reasonCode: "validation_failed",
      requestId: "req_opaque_001",
      metadata: {
        answer: "I have chest pain after taking semaglutide",
        condition: "weight loss",
        questionText: "Do you have a history of pancreatitis?",
        symptom: "nausea",
        medication: "compounded semaglutide",
        httpStatus: 422,
      },
    });

    const rendered = JSON.stringify(log);
    expect(rendered).toContain("req_opaque_001");
    expect(rendered).toContain('"httpStatus":422');
    for (const forbidden of [
      "chest pain",
      "weight loss",
      "pancreatitis",
      "nausea",
      "compounded semaglutide",
    ]) {
      expect(rendered).not.toContain(forbidden);
    }
    expect(log.metadata).toMatchObject({
      redactedUnknownMetadataKeys: 5,
    });
  });

  it("redacts patient identifiers and Stripe secrets without mutating input", () => {
    const stripeSecret = secretLike("sk", "test");
    const webhookSecret = ["whsec", "test_secret"].join("_");
    const input = {
      patient: {
        name: "SYNTHETIC_PERSON_SHOULD_NOT_RENDER",
        email: "synthetic-person@example.test",
        phone: "000-000-0000",
        dob: "1900-01-01",
        ssn: "000-00-0000",
      },
      stripe: {
        secretKey: stripeSecret,
        webhookSigningSecret: webhookSecret,
      },
      safe: "operation completed",
    };

    const redacted = redactForLog(input);
    const rendered = JSON.stringify(redacted);

    expect(input.patient.name).toBe("SYNTHETIC_PERSON_SHOULD_NOT_RENDER");
    expect(input.stripe.secretKey).toBe(stripeSecret);
    expect(rendered).not.toContain("SYNTHETIC_PERSON_SHOULD_NOT_RENDER");
    expect(rendered).not.toContain("synthetic-person@example.test");
    expect(rendered).not.toContain("000-000-0000");
    expect(rendered).not.toContain("000-00-0000");
    expect(rendered).not.toContain(stripeSecret);
    expect(rendered).not.toContain(webhookSecret);
    expect(rendered).not.toContain("operation completed");
  });

  it("redacts app linkage identifiers and opaque record keys", () => {
    const redacted = redactForLog({
      cognitoSub: "CognitoSub_SYNTHETIC_SHOULD_NOT_RENDER",
      mdiPatientId: "mdi_patient_SYNTHETIC_SHOULD_NOT_RENDER",
      mdiCaseId: "mdi_case_SYNTHETIC_SHOULD_NOT_RENDER",
      stripeCustomerId: "cus_SYNTHETIC_SHOULD_NOT_RENDER",
      stripeSubscriptionId: "sub_SYNTHETIC_SHOULD_NOT_RENDER",
      pk: "PATIENT#SYNTHETIC_SHOULD_NOT_RENDER",
      sk: "MDI#CASE#SYNTHETIC_SHOULD_NOT_RENDER",
      operation: "linkage sync failed",
    });
    const rendered = JSON.stringify(redacted);

    for (const forbidden of [
      "CognitoSub_SYNTHETIC_SHOULD_NOT_RENDER",
      "mdi_patient_SYNTHETIC_SHOULD_NOT_RENDER",
      "mdi_case_SYNTHETIC_SHOULD_NOT_RENDER",
      "cus_SYNTHETIC_SHOULD_NOT_RENDER",
      "sub_SYNTHETIC_SHOULD_NOT_RENDER",
      "PATIENT#SYNTHETIC_SHOULD_NOT_RENDER",
      "MDI#CASE#SYNTHETIC_SHOULD_NOT_RENDER",
    ]) {
      expect(rendered).not.toContain(forbidden);
    }
    expect(rendered).not.toContain("linkage sync failed");
    expect(rendered).toContain(redactedLogValue);
  });

  it("redacts neutral questionnaire and provider payload strings", () => {
    const webhookSecret = ["whsec", "test_secret"].join("_");
    const redacted = redactForLog({
      "Do you have chest pain?": "yes",
      [`huge_${"x".repeat(5000)}`]: 12345,
      responses: [
        {
          label: "Do you have pancreatitis?",
          value: "I have chest pain after medication",
        },
      ],
      code: "patient-reports-nausea",
      detail: "patient reports nausea after dose change",
      hivStatus: true,
      kind: "chest-pain-after-dose",
      medication: "semaglutide",
      metricName: "UnknownClinicalMetric",
      name: "patient_reports_nausea",
      rxnorm_12345: "clinical code",
      result: "provider note with clinical free text",
      secretCode: webhookSecret,
      stroke_history: false,
    });
    const rendered = JSON.stringify(redacted);

    for (const forbidden of [
      "Do you have chest pain?",
      `huge_${"x".repeat(5000)}`,
      "12345",
      "Do you have pancreatitis?",
      "I have chest pain after medication",
      "patient-reports-nausea",
      "patient reports nausea after dose change",
      "hivStatus",
      "chest-pain-after-dose",
      "semaglutide",
      "UnknownClinicalMetric",
      "patient_reports_nausea",
      "rxnorm_12345",
      "provider note with clinical free text",
      webhookSecret,
      "stroke_history",
    ]) {
      expect(rendered).not.toContain(forbidden);
    }
    expect(rendered).toContain(redactedLogValue);
  });

  it("drops or redacts unknown metadata by default", () => {
    const log = createStructuredLogEvent({
      event: "webhook_processed",
      level: "info",
      provider: "stripe",
      outcome: "success",
      reasonCode: "unknown",
      metadata: {
        retryable: false,
        arbitrary: "could contain PHI",
        providerPayload: {
          patientName: "SYNTHETIC_PERSON_SHOULD_NOT_RENDER",
        },
      },
    });

    expect(log.metadata).toMatchObject({
      retryable: false,
      redactedUnknownMetadataKeys: 2,
    });
    const rendered = JSON.stringify(log);
    expect(rendered).not.toContain("SYNTHETIC_PERSON_SHOULD_NOT_RENDER");
    expect(rendered).not.toContain("arbitrary");
    expect(rendered).not.toContain("providerPayload");
  });

  it("enforces safe value shapes for allowlisted metadata keys", () => {
    const log = createStructuredLogEvent({
      event: "metadata_shape_check",
      level: "info",
      metadata: {
        attempt: "SYNTHETIC_CLINICAL_FREE_TEXT_SHOULD_NOT_RENDER",
        durationMs: 42,
        httpStatus: {
          detail: "SYNTHETIC_CLINICAL_FREE_TEXT_SHOULD_NOT_RENDER",
        },
        metricName: "OnboardingFailures",
        queueDepth: "SYNTHETIC_CLINICAL_FREE_TEXT_SHOULD_NOT_RENDER",
        retryable: "SYNTHETIC_CLINICAL_FREE_TEXT_SHOULD_NOT_RENDER",
      },
    });
    const rendered = JSON.stringify(log);

    expect(log.metadata).toMatchObject({
      attempt: redactedLogValue,
      durationMs: 42,
      httpStatus: redactedLogValue,
      metricName: "OnboardingFailures",
      queueDepth: redactedLogValue,
      retryable: redactedLogValue,
    });
    expect(rendered).not.toContain("SYNTHETIC_CLINICAL_FREE_TEXT_SHOULD_NOT_RENDER");
  });

  it("redacts free-form error metadata", () => {
    const log = createStructuredLogEvent({
      event: "mdi_call_failed",
      level: "error",
      provider: "mdi",
      outcome: "failure",
      reasonCode: "provider_unavailable",
      metadata: {
        error: {
          name: "ProviderError",
          code: "MDI_503",
          kind: "type_2_diabetes",
          icd10Code: "icd10_E11",
          patientEmail: "synthetic-person@example.test",
          status: "hiv_positive",
          "Do you have chest pain?": "yes",
          type: "semaglutide",
          message: "SYNTHETIC_CLINICAL_FREE_TEXT_SHOULD_NOT_RENDER",
          stack: "at synthetic stack with SYNTHETIC_CLINICAL_FREE_TEXT_SHOULD_NOT_RENDER",
        },
      },
    });
    const rendered = JSON.stringify(log);

    expect(log.metadata?.error).toMatchObject({
      name: "ProviderError",
      code: "MDI_503",
      kind: redactedLogValue,
      redactedKey0: redactedLogValue,
      redactedKey1: redactedLogValue,
      redactedKey2: redactedLogValue,
      redactedKey3: redactedLogValue,
      message: redactedLogValue,
      stack: redactedLogValue,
      type: redactedLogValue,
    });
    expect(rendered).not.toContain("SYNTHETIC_CLINICAL_FREE_TEXT_SHOULD_NOT_RENDER");
    expect(rendered).not.toContain("type_2_diabetes");
    expect(rendered).not.toContain("icd10_E11");
    expect(rendered).not.toContain("icd10Code");
    expect(rendered).not.toContain("hiv_positive");
    expect(rendered).not.toContain("synthetic-person@example.test");
    expect(rendered).not.toContain("patientEmail");
    expect(rendered).not.toContain("Do you have chest pain?");
    expect(rendered).not.toContain("semaglutide");
  });

  it("redacts clinically-coded real Error names", () => {
    const rawError = new Error("SYNTHETIC_CLINICAL_FREE_TEXT_SHOULD_NOT_RENDER");
    rawError.name = "HIVPositiveError";
    const metadataError = new Error("SYNTHETIC_CLINICAL_FREE_TEXT_SHOULD_NOT_RENDER");
    metadataError.name = "PatientHypertensionError";

    const redacted = redactForLog({ error: rawError });
    const log = createStructuredLogEvent({
      event: "mdi_call_failed",
      level: "error",
      metadata: {
        error: metadataError,
      },
    });
    const rendered = JSON.stringify({ redacted, log });

    expect(redacted).toMatchObject({
      error: {
        name: redactedLogValue,
        message: redactedLogValue,
      },
    });
    expect(log.metadata?.error).toMatchObject({
      name: redactedLogValue,
      message: redactedLogValue,
    });
    expect(rendered).not.toContain("HIVPositiveError");
    expect(rendered).not.toContain("PatientHypertensionError");
    expect(rendered).not.toContain("SYNTHETIC_CLINICAL_FREE_TEXT_SHOULD_NOT_RENDER");
  });

  it("sanitizes log-hostile values deterministically", () => {
    const circular: Record<string, unknown> = {
      error: new Error("Synthetic patient says my phone is 000-000-0000"),
      count: 10n,
      largeCount: 2n ** 4096n,
      multiline: "line one\nline two\twith tab",
      callback: "https://example.test/callback?token=secret-token&ok=true",
      symbol: Symbol("hidden"),
    };
    circular.self = circular;

    const redacted = redactForLog(circular);
    const rendered = JSON.stringify(redacted);

    expect(redacted).toMatchObject({
      error: {
        name: "Error",
        message: redactedLogValue,
      },
      count: truncatedLogValue,
      self: circularLogValue,
      symbol: truncatedLogValue,
    });
    expect(rendered).not.toContain((2n ** 4096n).toString());
    expect(rendered.length).toBeLessThan(500);
    expect(rendered).not.toContain("000-000-0000");
    expect(rendered).not.toContain("secret-token");
    expect(rendered).not.toContain("\n");
    expect(rendered).not.toContain("\t");
  });

  it("caps deep nesting, oversized strings, arrays, and object breadth", () => {
    const deep = {
      a: {
        b: {
          c: {
            d: {
              e: {
                f: {
                  g: "too deep",
                },
              },
            },
          },
        },
      },
      long: "x".repeat(400),
      array: Array.from({ length: 40 }, (_, index) => index),
      wide: Object.fromEntries(
        Array.from({ length: 40 }, (_, index) => [`key${index}`, index]),
      ),
    };

    const rendered = JSON.stringify(redactForLog(deep));

    expect(rendered).toContain(truncatedLogValue);
    expect(rendered.length).toBeLessThan(900);
  });

  it("handles hostile object inspection and invalid runtime input", () => {
    const hostile = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error("entry enumeration failed");
        },
      },
    );
    const { proxy: revoked, revoke } = Proxy.revocable({}, {});
    revoke();

    expect(() => redactForLog(hostile)).not.toThrow();
    expect(redactForLog(hostile)).toBe(truncatedLogValue);
    expect(() => redactForLog(revoked)).not.toThrow();
    expect(redactForLog(revoked)).toBe(truncatedLogValue);
    expect(() =>
      createStructuredLogEvent(undefined as unknown as never),
    ).not.toThrow();
    expect(createStructuredLogEvent(null as unknown as never)).toEqual({
      event: "unknown_event",
      level: "info",
    });
    expect(
      createStructuredLogEvent({
        event: "patient_reports_nausea",
        level: "verbose",
        requestId: "req_patient_reports_nausea",
        correlationId: "corr_patient_email",
        provider: "SYNTHETIC_PERSON_SHOULD_NOT_RENDER",
        outcome: "chest pain",
        reasonCode: "raw provider message",
        stage: "review",
      } as unknown as never),
    ).toEqual({
      event: "unknown_event",
      level: "info",
    });
  });

  it("normalizes structured log writes before serialization", () => {
    const messages: string[] = [];
    const event = {
      event: "patient_reports_nausea",
      level: "warn",
      requestId: "req_patient_reports_nausea",
      toJSON() {
        return {
          event: "patient_reports_nausea",
          message: "SYNTHETIC_CLINICAL_FREE_TEXT_SHOULD_NOT_RENDER",
        };
      },
    } as unknown as Parameters<typeof writeStructuredLog>[0];

    expect(() =>
      writeStructuredLog(event, (message) => messages.push(message)),
    ).not.toThrow();

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("unknown_event");
    expect(messages[0]).not.toContain("SYNTHETIC_CLINICAL_FREE_TEXT_SHOULD_NOT_RENDER");
    expect(messages[0]).not.toContain("patient_reports_nausea");
  });

  it("applies a total redaction budget to broad nested values", () => {
    const broad = Object.fromEntries(
      Array.from({ length: 20 }, (_, outer) => [
        `group${outer}`,
        Object.fromEntries(
          Array.from({ length: 20 }, (_, inner) => [`item${inner}`, inner]),
        ),
      ]),
    );

    const rendered = JSON.stringify(redactForLog(broad));

    expect(rendered).toContain(truncatedLogValue);
    expect(rendered.length).toBeLessThan(5000);
  });

  it("writes structured logs through an injectable sink without throwing", () => {
    const messages: string[] = [];

    expect(() =>
      writeStructuredLog(
        createStructuredLogEvent({
          event: "stripe_signature_failed",
          level: "warn",
          provider: "stripe",
          outcome: "rejected",
          reasonCode: "signature_failed",
          metadata: {
            error: new Error(`bad ${secretLike("sk", "live")}`),
          },
        }),
        (message) => messages.push(message),
      ),
    ).not.toThrow();

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("stripe_signature_failed");
    expect(messages[0]).not.toContain(secretLike("sk", "live"));
  });

  it("swallows sink failures while attempting a fallback log", () => {
    let calls = 0;

    expect(() =>
      writeStructuredLog(
        createStructuredLogEvent({
          event: "stripe_signature_failed",
          level: "warn",
        }),
        () => {
          calls += 1;
          throw new Error("sink unavailable");
        },
      ),
    ).not.toThrow();
    expect(calls).toBe(2);
  });
});

function secretLike(prefix: "sk", mode: "live" | "test") {
  return [prefix, mode, "TEST_REDACTION_ONLY_000"].join("_");
}
