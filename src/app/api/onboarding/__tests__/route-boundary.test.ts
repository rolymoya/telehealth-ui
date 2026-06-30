import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  consentAcknowledgementFieldName,
  requiredConsentsForPrecheck,
} from "@/lib/consents";
import { anonymousPrecheckContextCookieName } from "../../../../../shared/intake/anonymous-precheck-context";

const mocks = vi.hoisted(() => ({
  acceptCurrentConsents: vi.fn(),
  completeIntakePrecheckProfileDynamoDb: vi.fn(),
  createDynamoDbAppDataRepository: vi.fn(() => ({ kind: "repo" })),
  createDynamoDbMdiIntakeRepository: vi.fn(() => ({ kind: "mdi-repo" })),
  createDynamoDbMdiPatientRepository: vi.fn(() => ({ kind: "mdi-patient-repo" })),
  createMdiHttpIntakeGateway: vi.fn(() => ({ kind: "mdi-gateway" })),
  createMdiHttpPatientGateway: vi.fn(() => ({ kind: "mdi-patient-gateway" })),
  createMdiPatientLinkage: vi.fn(),
  getServerSession: vi.fn(),
  loadMdiIntake: vi.fn(),
  readOnboardingGateSnapshotAsync: vi.fn(),
  resolveCognitoAuthConfig: vi.fn(),
  resolveDynamoDbAppDataConfig: vi.fn(),
  resolveMdiQuestionnaireForTreatment: vi.fn(),
  resolveMdiQuestionnaireId: vi.fn(),
  resolveOnboardingStartRedirect: vi.fn(),
  submitMdiIntake: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getServerSession: mocks.getServerSession,
  resolveCognitoAuthConfig: mocks.resolveCognitoAuthConfig,
}));

vi.mock("@/lib/auth/session-cookie", () => ({
  patientAccessCookieName: "apoth_patient_access",
}));

vi.mock("@/lib/consent-acceptance", () => ({
  acceptCurrentConsents: mocks.acceptCurrentConsents,
}));

vi.mock("@/lib/dynamodb/app-data-dynamodb", () => ({
  createDynamoDbAppDataRepository: mocks.createDynamoDbAppDataRepository,
  resolveDynamoDbAppDataConfig: mocks.resolveDynamoDbAppDataConfig,
}));

vi.mock("@/lib/intake-profile-dynamodb", () => ({
  completeIntakePrecheckProfileDynamoDb: mocks.completeIntakePrecheckProfileDynamoDb,
}));

vi.mock("@/lib/mdi-intake", () => ({
  loadMdiIntake: mocks.loadMdiIntake,
  submitMdiIntake: mocks.submitMdiIntake,
}));

vi.mock("@/lib/mdi-intake-dynamodb", () => ({
  createDynamoDbMdiIntakeRepository: mocks.createDynamoDbMdiIntakeRepository,
}));

vi.mock("@/lib/mdi-patient", () => ({
  createMdiPatientLinkage: mocks.createMdiPatientLinkage,
}));

vi.mock("@/lib/mdi-patient-dynamodb", () => ({
  createDynamoDbMdiPatientRepository: mocks.createDynamoDbMdiPatientRepository,
}));

vi.mock("@/lib/mdi-patient-gateway", () => ({
  createMdiHttpPatientGateway: mocks.createMdiHttpPatientGateway,
}));

vi.mock("@/lib/mdi-intake-gateway", () => ({
  createMdiHttpIntakeGateway: mocks.createMdiHttpIntakeGateway,
  resolveMdiQuestionnaireId: mocks.resolveMdiQuestionnaireId,
}));

vi.mock("@/lib/mdi-questionnaire-routing", () => ({
  resolveMdiQuestionnaireForTreatment: mocks.resolveMdiQuestionnaireForTreatment,
}));

vi.mock("@/lib/onboarding-start", () => ({
  resolveOnboardingStartRedirect: mocks.resolveOnboardingStartRedirect,
}));

vi.mock("@/lib/onboarding-status", () => ({
  readOnboardingGateSnapshotAsync: mocks.readOnboardingGateSnapshotAsync,
}));

describe("intake and onboarding API route boundary", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.APOTH_ALLOW_ENV_SECRET_PAYLOADS = "true";
    process.env.APOTH_REQUIRED_SERVER_SECRETS = "appSigning";
    process.env.APOTH_SECRET_APP_SIGNING_JSON = JSON.stringify({
      apothStage: "staging",
      schemaVersion: 1,
      secretKind: "appSigning",
      signingSecret: "route-boundary-signing-secret",
    });
    process.env.APOTH_STAGE = "staging";
    mocks.resolveCognitoAuthConfig.mockReturnValue({
      ok: true,
      value: { issuer: "https://cognito.example", userPoolClientId: "client", userPoolId: "pool" },
    });
    mocks.resolveDynamoDbAppDataConfig.mockReturnValue({
      ok: true,
      value: { tableName: "apoth-staging-app" },
    });
    mocks.getServerSession.mockResolvedValue({
      ok: true,
      value: { user: { cognitoSub: "cognito-sub-route" } },
    });
    mocks.readOnboardingGateSnapshotAsync.mockResolvedValue({
      ok: true,
      value: {
        consentAccepted: true,
        onboardingStatus: "profile_pending",
      },
    });
    mocks.resolveMdiQuestionnaireForTreatment.mockReturnValue({
      ok: true,
      questionnaireId: "mdi_questionnaire_route",
    });
    mocks.resolveMdiQuestionnaireId.mockReturnValue("mdi_questionnaire_route");
  });

  it("requires an authenticated session before starting onboarding", async () => {
    const { GET } = await import("../start/route");

    const response = await GET(request("https://apoth.test/api/onboarding/start"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "authentication_required" });
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    expect(mocks.resolveOnboardingStartRedirect).not.toHaveBeenCalled();
    expect(mocks.createDynamoDbAppDataRepository).not.toHaveBeenCalled();
  });

  it("resolves the next onboarding destination through the real route boundary", async () => {
    mocks.resolveOnboardingStartRedirect.mockResolvedValueOnce({
      ok: true,
      value: { destination: "/onboarding/consent" },
    });
    const { GET } = await import("../start/route");

    const response = await GET(request("https://apoth.test/api/onboarding/start", {
      cookie: true,
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    await expect(response.json()).resolves.toEqual({
      destination: "/onboarding/consent",
      status: "ready",
    });
    expect(mocks.resolveOnboardingStartRedirect).toHaveBeenCalledWith(expect.objectContaining({
      pathname: "/get-started",
      repository: { kind: "repo" },
      token: "valid-token",
    }));
  });

  it("rejects consent writes from a foreign origin before auth or storage", async () => {
    const { POST } = await import("../consent/route");

    const response = await POST(request("https://apoth.test/api/onboarding/consent", {
      body: { acknowledgements: { terms: "accepted" } },
      cookie: true,
      method: "POST",
      origin: "https://evil.test",
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "invalid_origin" });
    expect(mocks.getServerSession).not.toHaveBeenCalled();
    expect(mocks.acceptCurrentConsents).not.toHaveBeenCalled();
  });

  it("records consent acknowledgements without exposing route internals", async () => {
    mocks.acceptCurrentConsents.mockResolvedValueOnce({
      ok: true,
      value: { destination: "/intake" },
    });
    const { POST } = await import("../consent/route");

    const response = await POST(request("https://apoth.test/api/onboarding/consent", {
      body: {
        acknowledgements: {
          terms_current: "accepted",
          ignored_object: { nested: true },
        },
      },
      cookie: true,
      method: "POST",
      origin: "https://apoth.test",
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      destination: "/intake",
      status: "accepted",
    });
    expect(mocks.acceptCurrentConsents).toHaveBeenCalledWith(expect.objectContaining({
      acknowledgements: { terms_current: "accepted" },
      repository: { kind: "repo" },
      token: "valid-token",
    }));
  });

  it("mints a privacy notice gate cookie without app-data side effects", async () => {
    const { POST } = await import("../../intake/privacy-notice/route");

    const response = await POST(request("https://apoth.test/api/intake/privacy-notice", {
      body: {
        acknowledgements: currentPrivacyNoticeAcknowledgements(),
      },
      method: "POST",
      origin: "https://apoth.test",
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "privacy_notice_accepted",
    });
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("__Host-apoth_privacy_notice=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=1800");
    expect(mocks.createDynamoDbAppDataRepository).not.toHaveBeenCalled();
    expect(mocks.getServerSession).not.toHaveBeenCalled();
  });

  it("rejects invalid privacy notice minting without setting a cookie", async () => {
    const { POST } = await import("../../intake/privacy-notice/route");

    for (const body of [
      {},
      { acknowledgements: { stale: "accepted" } },
      { acknowledgements: { nested: { value: "accepted" } } },
    ]) {
      const response = await POST(request("https://apoth.test/api/intake/privacy-notice", {
        body,
        method: "POST",
        origin: "https://apoth.test",
      }));

      expect(response.status).toBe(400);
      expect(response.headers.get("set-cookie")).toBeNull();
    }
  });

  it("bootstraps anonymous precheck after privacy notice without DynamoDB access", async () => {
    const privacyCookie = await mintPrivacyNoticeCookie();
    const { GET } = await import("../../intake/bootstrap/route");

    const response = await GET(request("https://apoth.test/api/intake/bootstrap", {
      cookie: privacyCookie,
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      csrfToken: csrfFor("intake-precheck", privacyCookieValue(privacyCookie)),
      status: "ready_for_anonymous_precheck",
    });
    expect(mocks.createDynamoDbAppDataRepository).not.toHaveBeenCalled();
    expect(mocks.getServerSession).not.toHaveBeenCalled();
  });

  it("does not downgrade invalid authenticated intake bootstrap cookies", async () => {
    mocks.getServerSession.mockResolvedValueOnce({ ok: false });
    const { GET } = await import("../../intake/bootstrap/route");

    const response = await GET(request("https://apoth.test/api/intake/bootstrap", {
      cookie: true,
    }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "authentication_required",
    });
  });

  it("does not downgrade empty or malformed authenticated bootstrap cookies", async () => {
    const privacyCookie = await mintPrivacyNoticeCookie();
    const { GET } = await import("../../intake/bootstrap/route");

    for (const authCookie of ["apoth_patient_access=", "apoth_patient_access=%E0%A4%A"]) {
      mocks.getServerSession.mockResolvedValueOnce({ ok: false });
      const response = await GET(request("https://apoth.test/api/intake/bootstrap", {
        cookie: `${authCookie}; ${privacyCookie}`,
      }));

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({
        error: "authentication_required",
      });
    }
  });

  it("rejects tampered anonymous privacy evidence before precheck storage", async () => {
    const privacyCookie = await mintPrivacyNoticeCookie();
    const tampered = `${privacyCookie}x`;
    const { POST } = await import("../../intake/precheck/route");

    const response = await POST(request("https://apoth.test/api/intake/precheck", {
      body: {
        age: "34",
        blockingContraindication: "no",
        emergencySymptoms: "no",
        offering: "weight",
        state: "IL",
      },
      cookie: tampered,
      csrf: csrfFor("intake-precheck", privacyCookieValue(privacyCookie)),
      method: "POST",
      origin: "https://apoth.test",
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: "privacy_notice_required",
    });
    expect(mocks.completeIntakePrecheckProfileDynamoDb).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("stores anonymous precheck only in a short-lived httpOnly cookie", async () => {
    const privacyCookie = await mintPrivacyNoticeCookie();
    const { POST } = await import("../../intake/precheck/route");

    const response = await POST(request("https://apoth.test/api/intake/precheck", {
      body: {
        age: "34",
        blockingContraindication: "no",
        emergencySymptoms: "no",
        offering: "weight",
        state: "IL",
      },
      cookie: privacyCookie,
      csrf: csrfFor("intake-precheck", privacyCookieValue(privacyCookie)),
      method: "POST",
      origin: "https://apoth.test",
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ status: "ready_for_account_creation" });
    expect(JSON.stringify(body)).not.toMatch(/weight|34|emergency|contraindication/i);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${anonymousPrecheckContextCookieName}=`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Max-Age=1800");
    expect(mocks.completeIntakePrecheckProfileDynamoDb).not.toHaveBeenCalled();
    expect(mocks.createDynamoDbAppDataRepository).not.toHaveBeenCalled();
  });

  it("does not downgrade empty or malformed authenticated precheck cookies", async () => {
    const privacyCookie = await mintPrivacyNoticeCookie();
    const { POST } = await import("../../intake/precheck/route");

    for (const authCookie of ["apoth_patient_access=", "apoth_patient_access=%E0%A4%A"]) {
      mocks.getServerSession.mockResolvedValueOnce({ ok: false });
      const response = await POST(request("https://apoth.test/api/intake/precheck", {
        body: {
          age: "34",
          blockingContraindication: "no",
          emergencySymptoms: "no",
          offering: "weight",
          state: "IL",
        },
        cookie: `${authCookie}; ${privacyCookie}`,
        csrf: csrfFor("intake-precheck", privacyCookieValue(privacyCookie)),
        method: "POST",
        origin: "https://apoth.test",
      }));

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({
        code: "authentication_required",
      });
      expect(response.headers.get("set-cookie")).toBeNull();
    }
    expect(mocks.completeIntakePrecheckProfileDynamoDb).not.toHaveBeenCalled();
  });

  it("persists only residency and onboarding status after a successful intake precheck", async () => {
    mocks.completeIntakePrecheckProfileDynamoDb.mockResolvedValueOnce({
      ok: true,
      value: {
        onboardingStatus: "intake_ready",
        residencyState: "IL",
      },
    });
    const { POST } = await import("../../intake/precheck/route");

    const response = await POST(request("https://apoth.test/api/intake/precheck", {
      body: {
        age: "34",
        blockingContraindication: "no",
        emergencySymptoms: "no",
        offering: "weight",
        state: "IL",
      },
      cookie: true,
      csrfScope: "intake-precheck",
      method: "POST",
      origin: "https://apoth.test",
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      mdiPatientCsrfToken: csrfFor("mdi-patient"),
      profile: {
        onboardingStatus: "intake_ready",
        residencyState: "IL",
      },
      status: "ready_for_mdi_intake",
    });
    expect(JSON.stringify(body)).not.toContain("weight");
    expect(JSON.stringify(body)).not.toContain("34");
    expect(mocks.completeIntakePrecheckProfileDynamoDb).toHaveBeenCalledWith(
      { kind: "repo" },
      expect.objectContaining({
        cognitoSub: "cognito-sub-route",
        residencyState: "IL",
      }),
    );
  });

  it("stops ineligible precheck before storage side effects", async () => {
    const { POST } = await import("../../intake/precheck/route");

    const response = await POST(request("https://apoth.test/api/intake/precheck", {
      body: {
        age: "17",
        blockingContraindication: "no",
        emergencySymptoms: "no",
        offering: "weight",
        state: "IL",
      },
      cookie: true,
      csrfScope: "intake-precheck",
      method: "POST",
      origin: "https://apoth.test",
    }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      code: "under_18",
      outcome: "ineligible",
    });
    expect(mocks.completeIntakePrecheckProfileDynamoDb).not.toHaveBeenCalled();
  });

  it("returns patient-safe MDI maintenance responses without question payloads", async () => {
    mocks.loadMdiIntake.mockResolvedValueOnce({
      ok: false,
      error: {
        code: "provider_unavailable",
        message: "MDI maintenance with raw provider payload",
        retryable: true,
        status: 503,
      },
    });
    const { GET } = await import("../mdi/bootstrap/route");

    const response = await GET(request("https://apoth.test/api/onboarding/mdi/bootstrap", {
      cookie: true,
    }));

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toEqual({ code: "provider_unavailable" });
    expect(JSON.stringify(body)).not.toMatch(/payload|question|answer/i);
  });

  it("creates MDI patient linkage from transient demographics before questionnaire bootstrap", async () => {
    mocks.readOnboardingGateSnapshotAsync.mockResolvedValueOnce({
      ok: true,
      value: {
        consentAccepted: true,
        onboardingStatus: "intake_ready",
      },
    });
    mocks.createMdiPatientLinkage.mockResolvedValueOnce({
      ok: true,
      value: {
        mdiPatientId: "mdi_patient_route",
        status: "linked",
      },
    });
    const { POST } = await import("../mdi/patient/route");

    const response = await POST(request("https://apoth.test/api/onboarding/mdi/patient", {
      body: {
        address1: "1 Example St",
        city: "Chicago",
        dateOfBirth: "1990-01-02",
        email: "patient@example.test",
        firstName: "PATIENT_NAME_SENTINEL",
        gender: "2",
        lastName: "Example",
        phoneNumber: "312-555-0101",
        state: "IL",
        treatment: "weight",
        zipCode: "60601",
      },
      cookie: true,
      csrfScope: "mdi-patient",
      method: "POST",
      origin: "https://apoth.test",
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      redirect: "/onboarding/mdi",
      status: "linked",
    });
    expect(JSON.stringify(body)).not.toMatch(/PATIENT_NAME_SENTINEL|patient@example\.test|60601/);
    expect(response.headers.get("set-cookie")).toContain("__Host-apoth_mdi_questionnaire=");
    expect(mocks.resolveMdiQuestionnaireForTreatment).toHaveBeenCalledWith("weight", expect.any(Object));
    expect(mocks.createMdiPatientLinkage).toHaveBeenCalledWith(
      {
        cognitoSub: "cognito-sub-route",
        patient: expect.objectContaining({
          date_of_birth: "1990-01-02",
          email: "patient@example.test",
          first_name: "PATIENT_NAME_SENTINEL",
          last_name: "Example",
        }),
      },
      expect.objectContaining({
        gateway: { kind: "mdi-patient-gateway" },
        repository: { kind: "mdi-patient-repo" },
      }),
    );
  });

  it("fails closed before MDI patient creation when treatment has no questionnaire mapping", async () => {
    mocks.readOnboardingGateSnapshotAsync.mockResolvedValueOnce({
      ok: true,
      value: {
        consentAccepted: true,
        onboardingStatus: "intake_ready",
      },
    });
    mocks.resolveMdiQuestionnaireForTreatment.mockReturnValueOnce({
      ok: false,
      code: "questionnaire_unavailable",
      status: 503,
    });
    const { POST } = await import("../mdi/patient/route");

    const response = await POST(request("https://apoth.test/api/onboarding/mdi/patient", {
      body: {
        treatment: "weight",
      },
      cookie: true,
      csrfScope: "mdi-patient",
      method: "POST",
      origin: "https://apoth.test",
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ code: "questionnaire_unavailable" });
    expect(mocks.createMdiPatientLinkage).not.toHaveBeenCalled();
  });

  it("bootstraps MDI with a CSRF token and no workflow URLs", async () => {
    mocks.loadMdiIntake.mockResolvedValueOnce({
      ok: true,
      value: {
        questionnaire: {
          patientId: "mdi_patient_route",
          questionnaireId: "mdi_questionnaire_route",
          questions: [],
        },
        status: "ready",
      },
    });
    const { GET } = await import("../mdi/bootstrap/route");

    const response = await GET(request("https://apoth.test/api/onboarding/mdi/bootstrap", {
      cookie: true,
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      csrfToken: csrfFor("mdi-intake"),
      questionnaire: {
        patientId: "mdi_patient_route",
        questionnaireId: "mdi_questionnaire_route",
        questions: [],
      },
      status: "ready",
    });
    expect(JSON.stringify(body)).not.toMatch(/workflow|https?:\/\//i);
  });

  it("submits transient MDI answers while returning only opaque linkage", async () => {
    mocks.submitMdiIntake.mockResolvedValueOnce({
      ok: true,
      value: {
        linkage: {
          mdiCaseId: "mdi_case_route",
          mdiPatientId: "mdi_patient_route",
        },
        status: "submitted",
        submissionId: "mdi_submission_opaque",
      },
    });
    const { POST } = await import("../mdi/submit/route");

    const response = await POST(request("https://apoth.test/api/onboarding/mdi/submit", {
      body: {
        casePayload: {
          case_questions: [
            {
              answer: "ANSWER_VALUE_SENTINEL",
              question: "QUESTION_TEXT_SENTINEL",
              type: "free_text",
            },
          ],
        },
        questionnaireId: "mdi_questionnaire_route",
        responses: [
          {
            questionId: "mdi_question_route",
            value: "ANSWER_VALUE_SENTINEL",
          },
        ],
      },
      cookie: true,
      csrfScope: "mdi-intake",
      method: "POST",
      origin: "https://apoth.test",
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      linkage: {
        mdiCaseId: "mdi_case_route",
        mdiPatientId: "mdi_patient_route",
      },
      status: "submitted",
    });
    expect(JSON.stringify(body)).not.toContain("ANSWER_VALUE_SENTINEL");
    expect(JSON.stringify(body)).not.toContain("QUESTION_TEXT_SENTINEL");
    expect(JSON.stringify(body)).not.toContain("mdi_submission_opaque");
    expect(mocks.submitMdiIntake).toHaveBeenCalledWith(
      expect.objectContaining({
        casePayload: expect.objectContaining({
          case_questions: expect.arrayContaining([
            expect.objectContaining({ answer: "ANSWER_VALUE_SENTINEL" }),
          ]),
        }),
        cognitoSub: "cognito-sub-route",
        questionnaireId: "mdi_questionnaire_route",
        responses: expect.arrayContaining([
          expect.objectContaining({ value: "ANSWER_VALUE_SENTINEL" }),
        ]),
      }),
      expect.objectContaining({
        expectedQuestionnaireId: "mdi_questionnaire_route",
        gateway: { kind: "mdi-gateway" },
        repository: { kind: "mdi-repo" },
      }),
    );
  });
});

function request(url: string, options: {
  body?: unknown;
  cookie?: boolean | string;
  csrf?: string;
  csrfScope?: string;
  method?: string;
  origin?: string;
} = {}) {
  const headers: Record<string, string> = {};
  if (typeof options.cookie === "string") {
    headers.cookie = options.cookie;
  } else if (options.cookie) {
    headers.cookie = "apoth_patient_access=valid-token";
  }
  if (options.origin) {
    headers.origin = options.origin;
  }
  if (options.csrf) {
    headers["x-apoth-csrf"] = options.csrf;
  }
  if (options.csrfScope) {
    headers["x-apoth-csrf"] = csrfFor(options.csrfScope);
  }
  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
  }

  return new NextRequest(url, {
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    headers,
    method: options.method ?? "GET",
  });
}

function csrfFor(scope: string, token = "valid-token") {
  return createHash("sha256")
    .update(`${scope}:${token}`)
    .digest("base64url");
}

function currentPrivacyNoticeAcknowledgements() {
  const privacyNotice = requiredConsentsForPrecheck().find((consent) =>
    consent.consentKind === "privacy_notice"
  );
  if (!privacyNotice) {
    throw new Error("Expected privacy notice consent");
  }
  return {
    [consentAcknowledgementFieldName(privacyNotice)]: "accepted",
  };
}

async function mintPrivacyNoticeCookie() {
  const { POST } = await import("../../intake/privacy-notice/route");
  const response = await POST(request("https://apoth.test/api/intake/privacy-notice", {
    body: {
      acknowledgements: currentPrivacyNoticeAcknowledgements(),
    },
    method: "POST",
    origin: "https://apoth.test",
  }));
  const cookie = response.headers.get("set-cookie");
  if (!cookie) {
    throw new Error("Expected privacy notice cookie");
  }
  return cookie.split(";")[0];
}

function privacyCookieValue(cookie: string) {
  const [, value] = cookie.split("=");
  return decodeURIComponent(value ?? "");
}
