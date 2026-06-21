import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createMdiCase,
  createMdiPatient,
  getMdiQuestionnaireQuestions,
  requestMdi,
  submitMdiQuestionnaireResponses,
  type MdiClientOptions,
} from "@/lib/mdi/client";
import { resetMdiTokenCacheForTests } from "@/lib/mdi/token";
import { placeholderSecretPayload } from "@/lib/secrets/contracts";
import type { StartupSecretSource } from "@/lib/secrets/startup";

type FetchResponse = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
};

function jsonResponse(status: number, payload: unknown): FetchResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    },
    async text() {
      return JSON.stringify(payload);
    },
  };
}

function invalidJsonResponse(): FetchResponse {
  return {
    ok: true,
    status: 200,
    async json() {
      throw new SyntaxError("invalid json");
    },
    async text() {
      return "{";
    },
  };
}

function secretSource(): StartupSecretSource {
  return {
    async getSecretValue(kind) {
      return kind === "mdiApi"
        ? JSON.stringify(placeholderSecretPayload("staging", "mdiApi"))
        : null;
    },
  };
}

function tokenPayload(accessToken: string) {
  return {
    access_token: accessToken,
    expires_in: 3600,
    token_type: "Bearer",
  };
}

function clientOptions(fetchMock: ReturnType<typeof vi.fn>): MdiClientOptions {
  return {
    allowFakeSecretValuesForTests: true,
    fetch: fetchMock as unknown as NonNullable<MdiClientOptions["fetch"]>,
    now: () => new Date("2026-06-10T12:00:00.000Z"),
    secretSource: secretSource(),
    stage: "staging",
  };
}

describe("MDI HTTP client", () => {
  beforeEach(() => {
    resetMdiTokenCacheForTests();
    vi.restoreAllMocks();
  });

  it("injects bearer auth and derives request URLs from the token base URL", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, tokenPayload("mdi_access_token_001")))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    await expect(
      requestMdi({
        method: "GET",
        path: "/partner/patients/mdi_patient_opaque",
      }, clientOptions(fetchMock)),
    ).resolves.toEqual({
      ok: true,
      value: { ok: true },
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://example.invalid/mdi/partner/patients/mdi_patient_opaque",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer mdi_access_token_001",
        }),
        method: "GET",
      }),
    );
  });

  it("creates an MDI patient with an opaque idempotency key", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, tokenPayload("mdi_access_token_001")))
      .mockResolvedValueOnce(jsonResponse(200, { patient_id: "mdi_patient_created" }));

    await expect(
      createMdiPatient({
        idempotencyKey: "mdi-patient-idempotency-001",
        patient: {
          first_name: "TRANSIENT_NAME_SENTINEL",
        },
      }, clientOptions(fetchMock)),
    ).resolves.toEqual({
      ok: true,
      value: {
        mdiPatientId: "mdi_patient_created",
      },
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://example.invalid/mdi/partner/patients",
      expect.objectContaining({
        body: JSON.stringify({
          first_name: "TRANSIENT_NAME_SENTINEL",
        }),
        headers: expect.objectContaining({
          authorization: "Bearer mdi_access_token_001",
          "content-type": "application/json",
          "idempotency-key": "mdi-patient-idempotency-001",
        }),
        method: "POST",
      }),
    );
  });

  it("canonicalizes raw UUID MDI patient create identifiers", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, tokenPayload("mdi_access_token_001")))
      .mockResolvedValueOnce(jsonResponse(200, {
        patient_id: "123e4567-e89b-12d3-a456-426614174000",
      }));

    await expect(
      createMdiPatient({
        patient: {
          first_name: "TRANSIENT_NAME_SENTINEL",
        },
      }, clientOptions(fetchMock)),
    ).resolves.toEqual({
      ok: true,
      value: {
        mdiPatientId: "mdi_patient_123e4567e89b12d3a456426614174000",
      },
    });
  });

  it("rejects ambiguous MDI patient create responses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, tokenPayload("mdi_access_token_001")))
      .mockResolvedValueOnce(jsonResponse(200, { id: "generic_response_id", status: "created" }));

    await expect(
      createMdiPatient({
        patient: {
          first_name: "TRANSIENT_NAME_SENTINEL",
        },
      }, clientOptions(fetchMock)),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "invalid_response",
        retryable: false,
      },
    });
  });

  it("creates an MDI case with transient case questions and an opaque idempotency key", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, tokenPayload("mdi_access_token_001")))
      .mockResolvedValueOnce(jsonResponse(200, { case_id: "mdi_case_created" }));

    await expect(
      createMdiCase({
        casePayload: {
          case_questions: [
            {
              answer: "ANSWER_VALUE_SENTINEL",
              question: "QUESTION_TEXT_SENTINEL",
            },
          ],
          patient_id: "mdi_patient_001",
        },
        idempotencyKey: "mdi-case-idempotency-001",
      }, clientOptions(fetchMock)),
    ).resolves.toEqual({
      ok: true,
      value: {
        mdiCaseId: "mdi_case_created",
      },
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://example.invalid/mdi/partner/cases",
      expect.objectContaining({
        body: JSON.stringify({
          case_questions: [
            {
              answer: "ANSWER_VALUE_SENTINEL",
              question: "QUESTION_TEXT_SENTINEL",
            },
          ],
          patient_id: "mdi_patient_001",
        }),
        headers: expect.objectContaining({
          authorization: "Bearer mdi_access_token_001",
          "content-type": "application/json",
          "idempotency-key": "mdi-case-idempotency-001",
        }),
        method: "POST",
      }),
    );
  });

  it("canonicalizes raw UUID MDI case create identifiers", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, tokenPayload("mdi_access_token_001")))
      .mockResolvedValueOnce(jsonResponse(200, {
        case_id: "123e4567-e89b-12d3-a456-426614174111",
      }));

    await expect(
      createMdiCase({
        casePayload: {
          patient_id: "mdi_patient_001",
        },
      }, clientOptions(fetchMock)),
    ).resolves.toEqual({
      ok: true,
      value: {
        mdiCaseId: "mdi_case_123e4567e89b12d3a456426614174111",
      },
    });
  });

  it("rejects ambiguous MDI case create responses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, tokenPayload("mdi_access_token_001")))
      .mockResolvedValueOnce(jsonResponse(200, { id: "generic_response_id", status: "created" }));

    await expect(
      createMdiCase({
        casePayload: {
          patient_id: "mdi_patient_001",
        },
      }, clientOptions(fetchMock)),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "invalid_response",
        retryable: false,
      },
    });
  });

  it("rejects PHI-shaped MDI case identifiers", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, tokenPayload("mdi_access_token_001")))
      .mockResolvedValueOnce(jsonResponse(200, { case_id: "patient@example.invalid" }));

    await expect(
      createMdiCase({
        casePayload: {
          patient_id: "mdi_patient_001",
        },
      }, clientOptions(fetchMock)),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "invalid_response",
        retryable: false,
      },
    });
  });

  it("retries once with a refreshed token after 401", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, tokenPayload("mdi_access_token_initial")))
      .mockResolvedValueOnce(jsonResponse(401, { error: "expired" }))
      .mockResolvedValueOnce(jsonResponse(200, tokenPayload("mdi_access_token_retry")))
      .mockResolvedValueOnce(jsonResponse(200, { status: "ok" }));

    await expect(
      requestMdi({ path: "/partner/cases/mdi_case_opaque" }, clientOptions(fetchMock)),
    ).resolves.toEqual({
      ok: true,
      value: { status: "ok" },
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer mdi_access_token_retry",
        }),
      }),
    );
  });

  it("maps a second 401 to unauthorized_after_refresh", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, tokenPayload("mdi_access_token_initial")))
      .mockResolvedValueOnce(jsonResponse(401, { error: "expired" }))
      .mockResolvedValueOnce(jsonResponse(200, tokenPayload("mdi_access_token_retry")))
      .mockResolvedValueOnce(jsonResponse(401, { error: "still expired" }));

    await expect(
      requestMdi({ path: "/partner/cases/mdi_case_opaque" }, clientOptions(fetchMock)),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "unauthorized_after_refresh",
        message: "MDI request remained unauthorized after token refresh",
        retryable: false,
        status: 401,
      },
    });
  });

  it("maps maintenance and provider errors safely", async () => {
    const maintenanceFixture = JSON.parse(
      readFileSync(path.join(process.cwd(), "tests/fixtures/mdi/maintenance-error.json"), "utf8"),
    );
    const maintenanceFetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, tokenPayload("mdi_access_token_001")))
      .mockResolvedValueOnce(jsonResponse(418, maintenanceFixture.response));

    await expect(
      requestMdi({ path: "/v1/status/platform" }, clientOptions(maintenanceFetch)),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "maintenance",
        message: "MDI is temporarily unavailable",
        retryAfterSeconds: 300,
        retryable: true,
        status: 418,
      },
    });

    resetMdiTokenCacheForTests();
    const providerFetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, tokenPayload("mdi_access_token_001")))
      .mockResolvedValueOnce(jsonResponse(503, { message: "raw provider body" }));

    await expect(
      requestMdi({ path: "/partner/cases" }, clientOptions(providerFetch)),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "provider_error",
        message: "MDI provider request failed",
        retryable: true,
        status: 503,
      },
    });

    resetMdiTokenCacheForTests();
    const validationFetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, tokenPayload("mdi_access_token_001")))
      .mockResolvedValueOnce(jsonResponse(400, { message: "raw validation body" }));

    await expect(
      requestMdi({ path: "/partner/cases" }, clientOptions(validationFetch)),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "provider_error",
        retryable: false,
        status: 400,
      },
    });
  });

  it("maps invalid JSON, timeout, and network failures to sanitized errors", async () => {
    const invalidJsonFetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, tokenPayload("mdi_access_token_001")))
      .mockResolvedValueOnce(invalidJsonResponse());

    await expect(
      requestMdi({ path: "/partner/cases" }, clientOptions(invalidJsonFetch)),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "invalid_response",
        retryable: false,
      },
    });

    resetMdiTokenCacheForTests();
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    const timeoutFetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, tokenPayload("mdi_access_token_001")))
      .mockRejectedValueOnce(abortError);

    await expect(
      requestMdi({ path: "/partner/cases" }, clientOptions(timeoutFetch)),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "timeout",
        retryable: true,
      },
    });

    resetMdiTokenCacheForTests();
    const networkFetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, tokenPayload("mdi_access_token_001")))
      .mockRejectedValueOnce(new Error("socket failed with secret detail"));

    const networkResult = await requestMdi(
      { path: "/partner/cases" },
      clientOptions(networkFetch),
    );

    expect(networkResult).toMatchObject({
      ok: false,
      error: {
        code: "network_error",
        retryable: true,
      },
    });
    expect(JSON.stringify(networkResult)).not.toContain("secret detail");
  });

  it("uses questionnaire fixture sentinels without returning submitted answers", async () => {
    const fixture = JSON.parse(
      readFileSync(path.join(process.cwd(), "tests/fixtures/mdi/questionnaire-flow.json"), "utf8"),
    );
    const logs: unknown[] = [];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, tokenPayload("mdi_access_token_001")))
      .mockResolvedValueOnce(jsonResponse(200, { questions: fixture.questionnaire.questions }))
      .mockResolvedValueOnce(jsonResponse(200, tokenPayload("mdi_access_token_002")))
      .mockResolvedValueOnce(jsonResponse(200, {
        status: "submitted",
        submissionId: "mdi_submission_opaque_001",
      }));

    const questions = await getMdiQuestionnaireQuestions(
      fixture.questionnaire.questionnaireId,
      clientOptions(fetchMock),
    );

    expect(questions.ok).toBe(true);
    expect(questions.ok ? questions.value : []).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          questionId: expect.any(String),
          text: "QUESTION_TEXT_SENTINEL",
        }),
      ]),
    );

    resetMdiTokenCacheForTests();
    const submission = await submitMdiQuestionnaireResponses(
      fixture.submissionShape,
      {
        ...clientOptions(fetchMock),
        log: (event) => logs.push(event),
      },
    );

    expect(submission).toEqual({
      ok: true,
      value: {
        status: "submitted",
        submissionId: "mdi_submission_opaque_001",
      },
    });
    expect(JSON.stringify(submission)).not.toContain("ANSWER_VALUE_SENTINEL");
    expect(JSON.stringify(logs)).not.toContain("ANSWER_VALUE_SENTINEL");
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining("ANSWER_VALUE_SENTINEL"),
      }),
    );
  });

  it("logs only safe operational metadata on failures", async () => {
    const logs: unknown[] = [];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, tokenPayload("mdi_access_token_secret_should_not_log")))
      .mockResolvedValueOnce(jsonResponse(500, {
        answer: "ANSWER_VALUE_SENTINEL",
        token: "mdi_access_token_secret_should_not_log",
      }));

    await requestMdi(
      {
        body: { answer: "ANSWER_VALUE_SENTINEL" },
        method: "POST",
        path: "/partner/questionnaires/mdi_questionnaire_opaque/responses",
      },
      {
        ...clientOptions(fetchMock),
        log: (event) => logs.push(event),
      },
    );

    expect(logs).toEqual([
      expect.objectContaining({
        event: "mdi_call_failed",
        metadata: {
          error: { code: "[REDACTED]" },
          httpStatus: 500,
          retryable: true,
        },
        provider: "mdi",
      }),
    ]);
    expect(JSON.stringify(logs)).not.toContain("ANSWER_VALUE_SENTINEL");
    expect(JSON.stringify(logs)).not.toContain("mdi_access_token_secret_should_not_log");
  });

  it("keeps production MDI fetch calls behind the MDI client/token layer", () => {
    const offenders: string[] = [];
    const root = path.join(process.cwd(), "src");

    for (const file of listSourceFiles(root)) {
      const relative = path.relative(process.cwd(), file);
      if (
        relative === "src/lib/mdi/client.ts" ||
        relative === "src/lib/mdi/token.ts" ||
        relative.includes("__tests__")
      ) {
        continue;
      }

      const contents = readFileSync(file, "utf8");
      if (/fetch\s*\(/.test(contents) && /mdi|partner\/(?:auth|cases|patients|questionnaires)/i.test(contents)) {
        offenders.push(relative);
      }
    }

    expect(offenders).toEqual([]);
  });
});

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      return listSourceFiles(fullPath);
    }
    return /\.(ts|tsx)$/.test(entry) ? [fullPath] : [];
  });
}
