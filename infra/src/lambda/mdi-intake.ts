import { createHash, createHmac } from "node:crypto";
import {
  type AttributeValue,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  TransactWriteItemsCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import {
  requiredConsentsBeforeBillingOrPrescribing,
  requiredConsentsBeforeMdi,
  requiredConsentsForCurrentOnboarding,
  type RequiredConsentDocument,
} from "../../../shared/consents";
import type { LaunchOfferingSlug } from "../../../shared/intake/precheck";
import {
  parseCookieHeader,
  patientAccessCookieName,
} from "../../../shared/auth/session-cookie";
import {
  loadMdiIntake,
  mdiIntakeFailure,
  submitMdiIntake,
  createMdiCaseIdempotencyKey,
  type MdiCasePayload,
  type MdiIntakeGateway,
  type MdiIntakeRepository,
  type MdiIntakeResponse,
  type MdiIntakeStatus,
} from "../../../src/lib/mdi-intake.js";

type ApiEvent = {
  body?: string | null;
  cookies?: string[];
  headers?: Record<string, string | undefined>;
};

type ApiResponse = {
  body: string;
  cookies?: string[];
  headers: Record<string, string>;
  statusCode: number;
};

type VerifiedSession = {
  cognitoSub: string;
  token: string;
};

type PatientProfile = {
  onboardingStatus?: MdiIntakeStatus;
};

type MdiLinkage = {
  mdiPatientId: string;
  mdiCaseId?: string;
};

type MdiPatientPayload = Record<string, unknown>;

type MdiMode = "live" | "synthetic";

let testGateway: MdiIntakeGateway | null = null;

const ddb = new DynamoDBClient({});
const mdiQuestionnaireContextCookieName = "__Host-apoth_mdi_questionnaire";

export function configureMdiIntakeLambdaForTests(input: {
  gateway?: MdiIntakeGateway | null;
}) {
  testGateway = input.gateway ?? null;
}

export async function bootstrapHandler(event: ApiEvent): Promise<ApiResponse> {
  const auth = await verifyCookieSession(event);
  if (!auth.ok) {
    return json(401, { code: auth.code });
  }

  const consent = await hasCurrentConsent(auth.session.cognitoSub, requiredConsentsBeforeMdi());
  if (!consent) {
    return json(403, {
      code: "consent_required",
      redirect: "/onboarding/consent",
    });
  }
  const profile = await getProfile(auth.session.cognitoSub);
  const linkage = await getMdiLinkage(auth.session.cognitoSub);
  if (profile?.onboardingStatus === "intake_ready" && !linkage?.mdiPatientId) {
    return json(409, {
      code: "patient_profile_required",
      redirect: "/intake",
    });
  }

  const result = await loadMdiIntake(
    { cognitoSub: auth.session.cognitoSub },
    {
      gateway: activeGateway(readMdiQuestionnaireContext(event, auth.session.token)),
      repository: dynamoRepository(),
    },
  );
  if (!result.ok) {
    return json(result.error.status, bodyForError(result.error.code));
  }

  return json(200, {
    csrfToken: csrfTokenFor("mdi-intake", auth.session.token),
    ...result.value,
  });
}

export async function submitHandler(event: ApiEvent): Promise<ApiResponse> {
  const csrf = await verifyCsrf(event, "mdi-intake");
  if (!csrf.ok) {
    return json(csrf.status, { code: csrf.code });
  }

  const consent = await hasCurrentConsent(csrf.session.cognitoSub, requiredConsentsBeforeMdi());
  if (!consent) {
    return json(403, {
      code: "consent_required",
      redirect: "/onboarding/consent",
    });
  }

  const parsed = parseSubmissionBody(event.body);
  if (!parsed.ok) {
    return json(400, { code: "invalid_json" });
  }

  const result = await submitMdiIntake(
    {
      cognitoSub: csrf.session.cognitoSub,
      ...parsed.value,
    },
    {
      expectedQuestionnaireId: readMdiQuestionnaireContext(event, csrf.session.token) ??
        requiredEnv("APOTH_MDI_QUESTIONNAIRE_ID"),
      gateway: activeGateway(),
      repository: dynamoRepository(),
    },
  );
  if (!result.ok) {
    return json(result.error.status, bodyForError(result.error.code));
  }

  const disclosureGate = await billingDisclosureStatus(csrf.session.cognitoSub);
  if (disclosureGate === "storage_unavailable") {
    return json(503, { code: "provider_unavailable" });
  }

  return json(200, {
    ...result.value,
    ...(disclosureGate === "medication_disclosure_required"
      ? { redirect: "/onboarding/consent?gate=medication" }
      : disclosureGate === "treatment_selection_required"
        ? { redirect: "/onboarding/mdi" }
        : {}),
  });
}

export async function patientHandler(event: ApiEvent): Promise<ApiResponse> {
  const csrf = await verifyCsrf(event, "mdi-patient");
  if (!csrf.ok) {
    return json(csrf.status, { code: csrf.code });
  }

  const consent = await hasCurrentConsent(csrf.session.cognitoSub, requiredConsentsBeforeMdi());
  if (!consent) {
    return json(403, {
      code: "consent_required",
      redirect: "/onboarding/consent",
    });
  }

  const profile = await getProfile(csrf.session.cognitoSub);
  if (profile?.onboardingStatus !== "intake_ready") {
    return json(409, {
      code: "precheck_required",
      redirect: "/intake",
    });
  }

  const parsed = parsePatientBody(event.body);
  if (!parsed.ok) {
    return json(400, { code: parsed.code });
  }
  const questionnaire = resolveQuestionnaireForTreatment(parsed.value.treatment);
  if (!questionnaire.ok) {
    return json(questionnaire.status, { code: questionnaire.code });
  }

  const existingLinkage = await getMdiLinkage(csrf.session.cognitoSub);
  if (!existingLinkage?.mdiPatientId) {
    const created = await createMdiPatientForMode({
      cognitoSub: csrf.session.cognitoSub,
      idempotencyKey: createMdiPatientIdempotencyKey(csrf.session.cognitoSub),
      patient: parsed.value.patient,
    });
    if (!created.ok) {
      return json(publicProviderStatus(created.status), { code: "provider_unavailable" });
    }

    const linked = await saveMdiPatientLinkage({
      cognitoSub: csrf.session.cognitoSub,
      idempotencyKey: createMdiPatientIdempotencyKey(csrf.session.cognitoSub),
      mdiPatientId: created.mdiPatientId,
      now: new Date().toISOString(),
    });
    if (!linked.ok) {
      return json(500, { code: "storage_failed" });
    }
  }

  const selected = await saveTreatmentSelection({
    cognitoSub: csrf.session.cognitoSub,
    now: new Date().toISOString(),
    questionnaireId: questionnaire.questionnaireId,
    treatment: questionnaire.treatment,
  });
  if (!selected.ok) {
    return json(503, { code: "questionnaire_unavailable" });
  }

  const cookie = createQuestionnaireContextCookie({
    questionnaireId: questionnaire.questionnaireId,
    sessionToken: csrf.session.token,
  });
  return {
    ...json(200, {
      redirect: "/onboarding/mdi",
      status: "linked",
    }),
    cookies: [cookie],
  };
}

function activeGateway(questionnaireId?: string | null): MdiIntakeGateway {
  if (testGateway) {
    return testGateway;
  }

  const mode = resolveMdiMode();
  if (!mode.ok) {
    return unavailableMdiGateway();
  }
  return mode.value === "synthetic"
    ? syntheticMdiGateway(questionnaireId)
    : productionMdiGateway(questionnaireId);
}

function resolveMdiMode():
  | { ok: true; value: MdiMode }
  | { ok: false; status: number } {
  const mode = (process.env.APOTH_MDI_MODE?.trim() || "live") as MdiMode;
  if (mode !== "live" && mode !== "synthetic") {
    return { ok: false, status: 500 };
  }
  if (mode === "synthetic") {
    const stage = process.env.APOTH_STAGE?.trim();
    if (!stage || stage === "production") {
      return { ok: false, status: 500 };
    }
  }
  return { ok: true, value: mode };
}

function unavailableMdiGateway(): MdiIntakeGateway {
  return {
    async createCase() {
      return mdiIntakeFailure(
        "provider_unavailable",
        "MDI provider is not available for this stage",
        { retryable: false, status: 503 },
      );
    },
    async loadQuestionnaire() {
      return mdiIntakeFailure(
        "provider_unavailable",
        "MDI provider is not available for this stage",
        { retryable: false, status: 503 },
      );
    },
  };
}

function syntheticMdiGateway(questionnaireIdOverride?: string | null): MdiIntakeGateway {
  return {
    async loadQuestionnaire(input) {
      if (!input.linkage?.mdiPatientId) {
        return mdiIntakeFailure(
          "provider_unavailable",
          "Synthetic MDI patient linkage is not available",
          { retryable: false, status: 503 },
        );
      }

      const questionnaireId = syntheticQuestionnaireId(questionnaireIdOverride);
      return {
        ok: true,
        value: {
          questionnaireId,
          patientId: input.linkage.mdiPatientId,
          ...(input.linkage.mdiCaseId ? { caseId: input.linkage.mdiCaseId } : {}),
          questions: syntheticQuestions(questionnaireId),
        },
      };
    },
    async createCase(input) {
      return {
        ok: true,
        value: {
          linkage: {
            mdiPatientId: input.patientId,
            mdiCaseId: syntheticOpaqueId(
              "mdi_case",
              `${input.cognitoSub}:${input.idempotencyKey}:${input.questionnaireId}`,
            ),
          },
          submissionId: syntheticOpaqueId(
            "mdi_submission",
            `${input.cognitoSub}:${input.idempotencyKey}:${input.questionnaireId}`,
          ),
        },
      };
    },
  };
}

function syntheticQuestionnaireId(questionnaireIdOverride?: string | null) {
  return questionnaireIdOverride?.trim() ||
    process.env.APOTH_MDI_QUESTIONNAIRE_ID?.trim() ||
    "mdi_questionnaire_synthetic";
}

function syntheticQuestions(questionnaireId: string) {
  const digest = createHash("sha256")
    .update(`synthetic-mdi:questionnaire:${questionnaireId}`)
    .digest("hex")
    .slice(0, 24);
  return [
    {
      questionId: `mdi_question_synthetic_${digest}_ready`,
      text: "Synthetic readiness check",
      controlType: "single_select",
      required: true,
      options: [
        {
          optionId: `mdi_option_synthetic_${digest}_ready_yes`,
          label: "Ready to continue",
        },
        {
          optionId: `mdi_option_synthetic_${digest}_ready_no`,
          label: "Not ready",
        },
      ],
    },
    {
      questionId: `mdi_question_synthetic_${digest}_note`,
      text: "Synthetic note",
      controlType: "free_text",
      required: false,
      constraints: {
        maxLength: 256,
      },
    },
  ];
}

function productionMdiGateway(questionnaireIdOverride?: string | null): MdiIntakeGateway {
  return {
    async loadQuestionnaire(input) {
      if (!input.linkage?.mdiPatientId) {
        return mdiIntakeFailure(
          "provider_unavailable",
          "MDI patient linkage is not available",
          { retryable: true, status: 503 },
        );
      }

      const questionnaireId = questionnaireIdOverride || requiredEnv("APOTH_MDI_QUESTIONNAIRE_ID");
      const questions = await requestMdi<unknown>({
        method: "GET",
        path: `/partner/questionnaires/${encodeURIComponent(questionnaireId)}/questions`,
      });
      if (!questions.ok) {
        return questions;
      }

      const parsed = parseMdiQuestions(questions.value);
      if (!parsed.ok) {
        return parsed;
      }

      return {
        ok: true,
        value: {
          questionnaireId,
          patientId: input.linkage.mdiPatientId,
          ...(input.linkage.mdiCaseId ? { caseId: input.linkage.mdiCaseId } : {}),
          questions: parsed.value,
        },
      };
    },
    async createCase(input) {
      const created = await requestMdi<unknown>({
        body: {
          ...input.casePayload,
          patient_id: input.patientId,
        },
        idempotencyKey: input.idempotencyKey,
        method: "POST",
        path: "/partner/cases",
      });
      if (!created.ok) {
        return created;
      }

      const parsed = parseMdiCase(created.value);
      if (!parsed.ok) {
        return parsed;
      }

      return {
        ok: true,
        value: {
          linkage: {
            mdiPatientId: input.patientId,
            mdiCaseId: parsed.value.mdiCaseId,
          },
        },
      };
    },
  };
}

async function requestMdi<T>(input: {
  body?: unknown;
  idempotencyKey?: string;
  method: "GET" | "POST";
  path: string;
}): Promise<
  | { ok: true; value: T }
  | ReturnType<typeof mdiIntakeFailure>
> {
  const token = await getMdiAccessToken();
  if (!token.ok) {
    return token;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${token.value.apiBaseUrl.replace(/\/+$/, "")}/${input.path.replace(/^\/+/, "")}`, {
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token.value.accessToken}`,
        ...(input.idempotencyKey ? { "idempotency-key": input.idempotencyKey } : {}),
        ...(input.body === undefined ? {} : { "content-type": "application/json" }),
      },
      method: input.method,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return mdiIntakeFailure(
        response.status === 418 ? "provider_unavailable" : "provider_unavailable",
        "MDI provider request failed",
        {
          retryAfterSeconds: parseRetryAfterSeconds(response.headers.get("retry-after")),
          retryable: response.status === 429 || response.status >= 500 || response.status === 418,
          status: response.status,
        },
      );
    }

    return { ok: true, value: await response.json() as T };
  } catch {
    clearTimeout(timeout);
    return mdiIntakeFailure(
      "provider_unavailable",
      "MDI provider request failed",
      { retryable: true, status: 503 },
    );
  }
}

async function getMdiAccessToken(): Promise<
  | { ok: true; value: { accessToken: string; apiBaseUrl: string } }
  | ReturnType<typeof mdiIntakeFailure>
> {
  const secret = await loadMdiApiSecret();
  if (!secret.ok) {
    return secret;
  }

  try {
    const response = await fetch(`${secret.value.apiBaseUrl.replace(/\/+$/, "")}/partner/auth/token`, {
      body: new URLSearchParams({
        client_id: secret.value.clientId,
        client_secret: secret.value.clientSecret,
        grant_type: "client_credentials",
      }).toString(),
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      method: "POST",
    });
    if (!response.ok) {
      return mdiIntakeFailure(
        "provider_unavailable",
        "MDI token request failed",
        { retryable: response.status >= 500 || response.status === 429, status: response.status },
      );
    }

    const payload = await response.json();
    if (!isRecord(payload) || typeof payload.access_token !== "string" || !payload.access_token.trim()) {
      return mdiIntakeFailure(
        "provider_unavailable",
        "MDI token response was invalid",
        { retryable: false, status: 502 },
      );
    }

    return {
      ok: true,
      value: {
        accessToken: payload.access_token.trim(),
        apiBaseUrl: secret.value.apiBaseUrl,
      },
    };
  } catch {
    return mdiIntakeFailure(
      "provider_unavailable",
      "MDI token request failed",
      { retryable: true, status: 503 },
    );
  }
}

async function createMdiPatient(input: {
  idempotencyKey: string;
  patient: MdiPatientPayload;
}): Promise<
  | { ok: true; mdiPatientId: string }
  | { ok: false; status: number }
> {
  const created = await requestMdi<unknown>({
    body: input.patient,
    idempotencyKey: input.idempotencyKey,
    method: "POST",
    path: "/partner/patients",
  });
  if (!created.ok) {
    return { ok: false, status: created.error.status };
  }
  const parsed = parseMdiPatient(created.value);
  return parsed.ok
    ? { ok: true, mdiPatientId: parsed.value.mdiPatientId }
    : { ok: false, status: parsed.error.status };
}

async function createMdiPatientForMode(input: {
  cognitoSub: string;
  idempotencyKey: string;
  patient: MdiPatientPayload;
}): Promise<
  | { ok: true; mdiPatientId: string }
  | { ok: false; status: number }
> {
  const mode = resolveMdiMode();
  if (!mode.ok) {
    return { ok: false, status: mode.status };
  }
  if (mode.value === "synthetic") {
    return {
      ok: true,
      mdiPatientId: syntheticOpaqueId("mdi_patient", input.cognitoSub),
    };
  }
  return createMdiPatient({
    idempotencyKey: input.idempotencyKey,
    patient: input.patient,
  });
}

function syntheticOpaqueId(prefix: "mdi_patient" | "mdi_case" | "mdi_submission", seed: string) {
  const digest = createHash("sha256")
    .update(`synthetic-mdi:${prefix}:${seed}`)
    .digest("hex")
    .slice(0, 24);
  return `${prefix}_synthetic_${digest}`;
}

async function loadMdiApiSecret(): Promise<
  | { ok: true; value: { apiBaseUrl: string; clientId: string; clientSecret: string } }
  | ReturnType<typeof mdiIntakeFailure>
> {
  const raw = await loadSecretString(requiredEnv("APOTH_SECRET_MDI_API_ID"));
  if (!raw.ok) {
    return raw;
  }

  try {
    const payload = JSON.parse(raw.value);
    if (
      !isRecord(payload) ||
      payload.apothStage !== requiredEnv("APOTH_STAGE") ||
      payload.secretKind !== "mdiApi" ||
      payload.schemaVersion !== 1 ||
      typeof payload.apiBaseUrl !== "string" ||
      typeof payload.clientId !== "string" ||
      typeof payload.clientSecret !== "string" ||
      !payload.apiBaseUrl.startsWith("https://") ||
      !payload.clientId.trim() ||
      !payload.clientSecret.trim()
    ) {
      return mdiIntakeFailure(
        "provider_unavailable",
        "MDI API secret is invalid",
        { retryable: false, status: 500 },
      );
    }
    return {
      ok: true,
      value: {
        apiBaseUrl: payload.apiBaseUrl.trim(),
        clientId: payload.clientId.trim(),
        clientSecret: payload.clientSecret.trim(),
      },
    };
  } catch {
    return mdiIntakeFailure(
      "provider_unavailable",
      "MDI API secret is invalid",
      { retryable: false, status: 500 },
    );
  }
}

async function loadSecretString(secretId: string): Promise<
  | { ok: true; value: string }
  | ReturnType<typeof mdiIntakeFailure>
> {
  const region = requiredEnv("AWS_REGION");
  const body = JSON.stringify({ SecretId: secretId });
  const signed = signAwsJsonRequest({
    body,
    region,
    service: "secretsmanager",
    target: "secretsmanager.GetSecretValue",
  });
  try {
    const response = await fetch(`https://secretsmanager.${region}.amazonaws.com/`, {
      body,
      headers: signed,
      method: "POST",
    });
    if (!response.ok) {
      return mdiIntakeFailure(
        "provider_unavailable",
        "MDI API secret could not be loaded",
        { retryable: response.status >= 500 || response.status === 429, status: 500 },
      );
    }
    const payload = await response.json();
    if (!isRecord(payload)) {
      return mdiIntakeFailure(
        "provider_unavailable",
        "MDI API secret response was invalid",
        { retryable: false, status: 500 },
      );
    }
    if (typeof payload.SecretString === "string") {
      return { ok: true, value: payload.SecretString };
    }
    if (typeof payload.SecretBinary === "string") {
      return { ok: true, value: Buffer.from(payload.SecretBinary, "base64").toString("utf8") };
    }
    return mdiIntakeFailure(
      "provider_unavailable",
      "MDI API secret was empty",
      { retryable: false, status: 500 },
    );
  } catch {
    return mdiIntakeFailure(
      "provider_unavailable",
      "MDI API secret could not be loaded",
      { retryable: true, status: 500 },
    );
  }
}

function dynamoRepository(): MdiIntakeRepository {
  return {
    async getStatus(cognitoSub) {
      const profile = await getProfile(cognitoSub);
      const linkage = await getMdiLinkage(cognitoSub);
      return {
        ok: true,
        value: {
          onboardingStatus: profile?.onboardingStatus,
          linkage,
        },
      };
    },
    async saveSubmitted(input) {
      const linked = await linkMdiCaseIfAbsent({
        cognitoSub: input.cognitoSub,
        linkage: input.linkage,
        now: input.now,
      });
      if (!linked.ok) {
        return mdiIntakeFailure(
          "storage_failed",
          "MDI case linkage could not be stored",
          { retryable: true, status: 500 },
        );
      }

      const recorded = await recordMdiCaseSubmittedAttempt({
        cognitoSub: input.cognitoSub,
        idempotencyKey: input.idempotencyKey,
        mdiCaseId: input.linkage.mdiCaseId,
        mdiPatientId: input.linkage.mdiPatientId,
        mdiSubmissionId: input.submissionId,
        now: input.now,
      });
      if (!recorded.ok) {
        return mdiIntakeFailure(
          "storage_failed",
          "MDI case submission status could not be stored",
          { retryable: true, status: 500 },
        );
      }

      try {
        await ddb.send(new UpdateItemCommand({
          ConditionExpression: "#recordType = :profileType AND #onboardingStatus = :expected",
          ExpressionAttributeNames: {
            "#onboardingStatus": "onboardingStatus",
            "#recordType": "recordType",
            "#updatedAt": "updatedAt",
          },
          ExpressionAttributeValues: {
            ":expected": { S: "intake_ready" },
            ":next": { S: "mdi_submitted" },
            ":profileType": { S: "patientProfile" },
            ":updatedAt": { S: input.now },
          },
          Key: profileKey(input.cognitoSub),
          TableName: requiredEnv("APP_TABLE_NAME"),
          UpdateExpression: "SET #onboardingStatus = :next, #updatedAt = :updatedAt",
        }));
        return {
          ok: true,
          value: input.linkage,
        };
      } catch (error) {
        if (isConditionalCheckFailed(error)) {
          const profile = await getProfile(input.cognitoSub);
          if (isSubmittedStatus(profile?.onboardingStatus)) {
            return {
              ok: true,
              value: input.linkage,
            };
          }
        }
        logStorageFailure("mdi_intake_save_submitted_profile", error);
        return mdiIntakeFailure(
          "storage_failed",
          "MDI intake status could not be stored",
          { retryable: true, status: 500 },
        );
      }
    },
    async claimSubmission(input) {
      const now = input.now;
      const idempotencyKey = createMdiCaseIdempotencyKey(input.cognitoSub);
      const linkage = await getMdiLinkage(input.cognitoSub);
      if (!linkage || linkage.mdiPatientId !== input.mdiPatientId) {
        return mdiIntakeFailure(
          "not_ready",
          "MDI patient linkage is required before case creation",
          { retryable: false, status: 409 },
        );
      }
      if (linkage.mdiCaseId) {
        return {
          ok: true,
          value: {
            idempotencyKey,
            mdiCaseId: linkage.mdiCaseId,
            outcome: "linkExisting",
          },
        };
      }

      const existing = await getMdiCaseCreateAttempt(input.cognitoSub);
      if (existing?.status === "submitted" && existing.mdiCaseId) {
        return {
          ok: true,
          value: {
            idempotencyKey: existing.idempotencyKey,
            mdiCaseId: existing.mdiCaseId,
            outcome: "linkExisting",
          },
        };
      }
      if (existing?.status === "case_storage_retryable_failure" && existing.mdiCaseId) {
        return {
          ok: true,
          value: {
            idempotencyKey: existing.idempotencyKey,
            mdiCaseId: existing.mdiCaseId,
            outcome: "linkExisting",
          },
        };
      }
      if (existing?.status === "claiming_case" && !isExpired(existing.claimExpiresAt, now)) {
        return { ok: true, value: { outcome: "alreadyClaiming", retryable: true } };
      }
      if (existing?.status === "case_provider_terminal_failure") {
        return { ok: true, value: { outcome: "terminalFailure", retryable: false } };
      }

      const nextAttempts = existing ? existing.attempts + 1 : 1;
      try {
        await ddb.send(new PutItemCommand({
          ...(existing ? {} : {
            ConditionExpression: "attribute_not_exists(#pk)",
            ExpressionAttributeNames: { "#pk": "pk" },
          }),
          Item: mdiCaseCreateAttemptItem({
            attempts: nextAttempts,
            claimExpiresAt: claimExpiresAt(now),
            cognitoSub: input.cognitoSub,
            idempotencyKey: existing?.idempotencyKey ?? idempotencyKey,
            lastAttemptAt: now,
            mdiPatientId: input.mdiPatientId,
            now,
            status: "claiming_case",
          }),
          TableName: requiredEnv("APP_TABLE_NAME"),
        }));
        return {
          ok: true,
          value: {
            idempotencyKey: existing?.idempotencyKey ?? idempotencyKey,
            outcome: "claimed",
          },
        };
      } catch (error) {
        if (isConditionalCheckFailed(error)) {
          return { ok: true, value: { outcome: "alreadyClaiming", retryable: true } };
        }
        return mdiIntakeFailure(
          "storage_failed",
          "MDI intake submission could not be claimed",
          { retryable: true, status: 500 },
        );
      }
    },
    async recordFailure(input) {
      const existing = await getMdiCaseCreateAttempt(input.cognitoSub);
      try {
        const item = mdiCaseCreateAttemptItem({
          attempts: existing?.attempts ?? 1,
          cognitoSub: input.cognitoSub,
          idempotencyKey: existing?.idempotencyKey ?? input.idempotencyKey,
          lastAttemptAt: input.now,
          mdiCaseId: input.mdiCaseId,
          mdiPatientId: input.mdiPatientId,
          now: existing?.createdAt ?? input.now,
          providerStatus: input.providerStatus,
          retryAfterSeconds: input.retryAfterSeconds,
          status: input.status,
        });
        await ddb.send(new PutItemCommand({
          Item: {
            ...item,
            updatedAt: { S: input.now },
          },
          TableName: requiredEnv("APP_TABLE_NAME"),
        }));
        return {
          ok: true,
          value: {
            attempts: Number(item.attempts.N),
            cognitoSub: input.cognitoSub,
            createdAt: item.createdAt.S ?? input.now,
            idempotencyKey: item.idempotencyKey.S ?? input.idempotencyKey,
            lastAttemptAt: input.now,
            mdiCaseId: input.mdiCaseId,
            mdiPatientId: input.mdiPatientId,
            pk: mdiCaseCreateAttemptKey(input.cognitoSub).pk.S ?? "",
            providerStatus: input.providerStatus,
            recordType: "mdiCaseCreateAttempt",
            retryAfterSeconds: input.retryAfterSeconds,
            schemaVersion: 1,
            sk: mdiCaseCreateAttemptKey(input.cognitoSub).sk.S ?? "",
            status: input.status,
            updatedAt: input.now,
          },
        };
      } catch {
        return mdiIntakeFailure(
          "storage_failed",
          "MDI intake failure status could not be stored",
          { retryable: true, status: 500 },
        );
      }
    },
  };
}

function parseMdiQuestions(payload: unknown): ReturnType<typeof mdiIntakeFailure> | {
  ok: true;
  value: Array<{
    questionId: string;
    text: string;
    controlType: string;
    required: boolean;
    options?: Array<{ optionId: string; label: string }>;
    constraints?: Record<string, unknown>;
  }>;
} {
  const rawQuestions = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.questions)
      ? payload.questions
      : null;
  if (!rawQuestions) {
    return mdiIntakeFailure(
      "provider_unavailable",
      "MDI question response was invalid",
      { retryable: false, status: 502 },
    );
  }

  const questions = [];
  for (const question of rawQuestions) {
    if (
      !isRecord(question) ||
      typeof question.questionId !== "string" ||
      typeof question.text !== "string" ||
      typeof question.controlType !== "string" ||
      typeof question.required !== "boolean"
    ) {
      return mdiIntakeFailure(
        "provider_unavailable",
        "MDI question response was invalid",
        { retryable: false, status: 502 },
      );
    }

    const options = [];
    if (Array.isArray(question.options)) {
      for (const option of question.options) {
        if (!isRecord(option) || typeof option.optionId !== "string" || typeof option.label !== "string") {
          return mdiIntakeFailure(
            "provider_unavailable",
            "MDI question option response was invalid",
            { retryable: false, status: 502 },
          );
        }
        options.push({
          optionId: option.optionId,
          label: option.label,
        });
      }
    }

    questions.push({
      questionId: question.questionId,
      text: question.text,
      controlType: question.controlType,
      required: question.required,
      ...(options.length > 0 ? { options } : {}),
      ...(isRecord(question.constraints) ? { constraints: question.constraints } : {}),
    });
  }

  return { ok: true, value: questions };
}

function parseMdiCase(payload: unknown): ReturnType<typeof mdiIntakeFailure> | {
  ok: true;
  value: { mdiCaseId: string };
} {
  if (!isRecord(payload)) {
    return mdiIntakeFailure(
      "provider_unavailable",
      "MDI case response was invalid",
      { retryable: false, status: 502 },
    );
  }

  const mdiCaseId = payload.case_id ?? payload.caseId ?? payload.id;
  if (typeof mdiCaseId !== "string" || !mdiCaseId.trim()) {
    return mdiIntakeFailure(
      "provider_unavailable",
      "MDI case response fields were invalid",
      { retryable: false, status: 502 },
    );
  }

  return {
    ok: true,
    value: { mdiCaseId: mdiCaseId.trim() },
  };
}

function parseMdiPatient(payload: unknown): ReturnType<typeof mdiIntakeFailure> | {
  ok: true;
  value: { mdiPatientId: string };
} {
  if (!isRecord(payload)) {
    return mdiIntakeFailure(
      "provider_unavailable",
      "MDI patient response was invalid",
      { retryable: false, status: 502 },
    );
  }

  const mdiPatientId = payload.patient_id ?? payload.patientId ?? payload.id;
  if (typeof mdiPatientId !== "string" || !mdiPatientId.trim()) {
    return mdiIntakeFailure(
      "provider_unavailable",
      "MDI patient response fields were invalid",
      { retryable: false, status: 502 },
    );
  }

  return {
    ok: true,
    value: { mdiPatientId: canonicalMdiId("mdi_patient", mdiPatientId) },
  };
}

function readMdiQuestionnaireContext(event: ApiEvent, sessionToken: string) {
  const value = parseCookieHeader(cookieHeader(event)).get(mdiQuestionnaireContextCookieName);
  if (!value || !sessionToken) {
    return null;
  }
  const [rawQuestionnaireId, signature, ...extra] = value.split(".");
  if (!rawQuestionnaireId || !signature || extra.length > 0) {
    return null;
  }
  let questionnaireId = "";
  try {
    questionnaireId = decodeURIComponent(rawQuestionnaireId);
  } catch {
    return null;
  }
  return signature === questionnaireContextSignature(questionnaireId, sessionToken)
    ? questionnaireId
    : null;
}

function createQuestionnaireContextCookie(input: {
  questionnaireId: string;
  sessionToken: string;
}) {
  const value = [
    encodeURIComponent(input.questionnaireId),
    questionnaireContextSignature(input.questionnaireId, input.sessionToken),
  ].join(".");
  return [
    `${mdiQuestionnaireContextCookieName}=${value}`,
    "Path=/",
    `Max-Age=${30 * 60}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ].join("; ");
}

function questionnaireContextSignature(questionnaireId: string, sessionToken: string) {
  return createHash("sha256")
    .update(`mdi-questionnaire:${questionnaireId}:${sessionToken}`)
    .digest("base64url");
}

function createMdiPatientIdempotencyKey(cognitoSub: string) {
  return `mdi-patient-${createHash("sha256")
    .update(`mdi-patient:${cognitoSub}`)
    .digest("hex")
    .slice(0, 32)}`;
}

function canonicalMdiId(prefix: "mdi_patient" | "mdi_case", value: string) {
  const trimmed = value.trim();
  return trimmed.startsWith(`${prefix}_`)
    ? trimmed
    : `${prefix}_${trimmed.replace(/[^A-Za-z0-9]/g, "")}`;
}

async function verifyCsrf(event: ApiEvent, scope: "mdi-intake" | "mdi-patient"):
  Promise<
    | { ok: true; session: VerifiedSession }
    | { ok: false; code: string; status: number }
  > {
  if (!isAllowedOrigin(event)) {
    return { ok: false, code: "invalid_origin", status: 403 };
  }

  if (!/^application\/json(?:;|$)/i.test(header(event, "content-type") ?? "")) {
    return { ok: false, code: "invalid_content_type", status: 415 };
  }

  const auth = await verifyCookieSession(event);
  if (!auth.ok) {
    return { ok: false, code: auth.code, status: 401 };
  }

  const csrfHeader = header(event, "x-apoth-csrf");
  if (!csrfHeader || csrfHeader !== csrfTokenFor(scope, auth.session.token)) {
    return { ok: false, code: "invalid_csrf", status: 403 };
  }

  return { ok: true, session: auth.session };
}

async function verifyCookieSession(event: ApiEvent):
  Promise<
    | { ok: true; session: VerifiedSession }
    | { ok: false; code: string }
  > {
  const token = parseCookieHeader(cookieHeader(event)).get(patientAccessCookieName);
  if (!token) {
    return { ok: false, code: "missing_session" };
  }

  try {
    const claims = await verifier().verify(token);
    const sub = typeof claims.sub === "string" ? claims.sub : "";
    if (!sub) {
      return { ok: false, code: "invalid_session" };
    }
    return {
      ok: true,
      session: {
        cognitoSub: sub,
        token,
      },
    };
  } catch {
    return { ok: false, code: "invalid_session" };
  }
}

function verifier() {
  return CognitoJwtVerifier.create({
    clientId: requiredEnv("COGNITO_USER_POOL_CLIENT_ID"),
    tokenUse: "access",
    userPoolId: requiredEnv("COGNITO_USER_POOL_ID"),
  });
}

async function hasCurrentConsent(
  cognitoSub: string,
  requiredConsents: readonly RequiredConsentDocument[] = requiredConsentsForCurrentOnboarding(),
) {
  for (const consent of requiredConsents) {
    const response = await ddb.send(new GetItemCommand({
      ConsistentRead: true,
      Key: consentKey(cognitoSub, consent.consentKind, consent.version),
      TableName: requiredEnv("APP_TABLE_NAME"),
    }));
    if (response.Item?.recordType?.S !== "consentEvidence") {
      return false;
    }
  }
  return true;
}

async function billingDisclosureStatus(cognitoSub: string): Promise<
  | "ok"
  | "medication_disclosure_required"
  | "treatment_selection_required"
  | "storage_unavailable"
> {
  const selection = await ddb.send(new GetItemCommand({
    ConsistentRead: true,
    Key: treatmentSelectionKey(cognitoSub),
    TableName: requiredEnv("APP_TABLE_NAME"),
  }));
  if (!selection.Item) {
    return "treatment_selection_required";
  }
  if (selection.Item.recordType?.S !== "onboardingTreatmentSelection") {
    return "storage_unavailable";
  }
  const treatment = selection.Item.treatment?.S;
  if (
    treatment !== "weight" &&
    treatment !== "hair" &&
    treatment !== "sexual-health"
  ) {
    return "treatment_selection_required";
  }

  return await hasCurrentConsent(
      cognitoSub,
      requiredConsentsBeforeBillingOrPrescribing({ treatment }),
    )
    ? "ok"
    : "medication_disclosure_required";
}

async function getProfile(cognitoSub: string): Promise<PatientProfile | null> {
  const response = await ddb.send(new GetItemCommand({
    ConsistentRead: true,
    Key: profileKey(cognitoSub),
    TableName: requiredEnv("APP_TABLE_NAME"),
  }));
  if (!response.Item) {
    return null;
  }
  if (response.Item.recordType?.S !== "patientProfile") {
    throw new Error("Patient profile key contains another record type");
  }
  return {
    onboardingStatus: toOnboardingStatus(response.Item.onboardingStatus?.S),
  };
}

async function getMdiLinkage(cognitoSub: string): Promise<MdiLinkage | null> {
  const response = await ddb.send(new GetItemCommand({
    ConsistentRead: true,
    Key: mdiLinkageKey(cognitoSub),
    TableName: requiredEnv("APP_TABLE_NAME"),
  }));
  if (!response.Item) {
    return null;
  }
  if (response.Item.recordType?.S !== "mdiLinkage") {
    throw new Error("MDI linkage key contains another record type");
  }
  const mdiPatientId = response.Item.mdiPatientId?.S;
  if (!mdiPatientId) {
    return null;
  }
  return {
    mdiPatientId,
    mdiCaseId: response.Item.mdiCaseId?.S,
  };
}

function parsePatientBody(body: string | null | undefined):
  | {
      ok: true;
      value: {
        patient: MdiPatientPayload;
        treatment: string;
      };
    }
  | { ok: false; code: string } {
  try {
    const parsed = body ? JSON.parse(body) : null;
    if (!isRecord(parsed)) {
      return { ok: false, code: "invalid_input" };
    }

    const firstName = boundedText(parsed.firstName, 1, 80);
    const lastName = boundedText(parsed.lastName, 1, 80);
    const dateOfBirth = dateOnly(parsed.dateOfBirth);
    const email = emailAddress(parsed.email);
    const phoneNumber = phone(parsed.phoneNumber);
    const address = boundedText(parsed.address1, 1, 120);
    const address2 = boundedText(parsed.address2, 0, 120);
    const city = boundedText(parsed.city, 1, 80);
    const state = stateCode(parsed.state);
    const zipCode = zip(parsed.zipCode);
    const treatment = boundedText(parsed.treatment, 1, 40);
    const gender = optionalInteger(parsed.gender, 0, 9);

    if (!firstName) return { ok: false, code: "missing_first_name" };
    if (!lastName) return { ok: false, code: "missing_last_name" };
    if (!dateOfBirth) return { ok: false, code: "invalid_date_of_birth" };
    if (!email) return { ok: false, code: "invalid_email" };
    if (!phoneNumber) return { ok: false, code: "invalid_phone" };
    if (!address) return { ok: false, code: "missing_address" };
    if (!city) return { ok: false, code: "missing_city" };
    if (!state) return { ok: false, code: "invalid_state" };
    if (!zipCode) return { ok: false, code: "invalid_zip" };
    if (!treatment) return { ok: false, code: "invalid_treatment" };

    return {
      ok: true,
      value: {
        patient: {
          address: {
            address,
            ...(address2 ? { address2 } : {}),
            city_name: city,
            state_name: state,
            zip_code: zipCode,
          },
          date_of_birth: dateOfBirth,
          email,
          first_name: firstName,
          ...(gender === null ? {} : { gender }),
          is_email_enabled: true,
          is_sms_enabled: false,
          last_name: lastName,
          phone_number: phoneNumber,
          phone_type: 1,
        },
        treatment,
      },
    };
  } catch {
    return { ok: false, code: "invalid_input" };
  }
}

function resolveQuestionnaireForTreatment(treatment: string):
  | { ok: true; questionnaireId: string; treatment: LaunchOfferingSlug }
  | { ok: false; code: "invalid_treatment" | "questionnaire_unavailable"; status: number } {
  if (!["sexual-health", "hair", "weight"].includes(treatment)) {
    return { ok: false, code: "invalid_treatment", status: 400 };
  }
  const normalized = treatment as LaunchOfferingSlug;
  const mapping = parseQuestionnaireMapping(process.env.APOTH_MDI_QUESTIONNAIRE_IDS);
  if (mapping) {
    const mapped = mapping[treatment];
    const questionnaireId = typeof mapped === "string" ? mapped.trim() : "";
    return questionnaireId
      ? { ok: true, questionnaireId, treatment: normalized }
      : { ok: false, code: "questionnaire_unavailable", status: 503 };
  }
  const fallback = process.env.APOTH_MDI_QUESTIONNAIRE_ID?.trim();
  return fallback
    ? { ok: true, questionnaireId: fallback, treatment: normalized }
    : { ok: false, code: "questionnaire_unavailable", status: 503 };
}

async function saveTreatmentSelection(input: {
  cognitoSub: string;
  now: string;
  questionnaireId: string;
  treatment: LaunchOfferingSlug;
}): Promise<{ ok: true } | { ok: false }> {
  const existing = await ddb.send(new GetItemCommand({
    ConsistentRead: true,
    Key: treatmentSelectionKey(input.cognitoSub),
    TableName: requiredEnv("APP_TABLE_NAME"),
  }));
  if (existing.Item) {
    return existing.Item.recordType?.S === "onboardingTreatmentSelection" &&
        existing.Item.questionnaireId?.S === input.questionnaireId &&
        existing.Item.treatment?.S === input.treatment
      ? { ok: true }
      : { ok: false };
  }

  try {
    await ddb.send(new PutItemCommand({
      ConditionExpression: "attribute_not_exists(#pk) AND attribute_not_exists(#sk)",
      ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
      Item: treatmentSelectionItem(input),
      TableName: requiredEnv("APP_TABLE_NAME"),
    }));
    return { ok: true };
  } catch (error) {
    if (!isConditionalCheckFailed(error)) {
      return { ok: false };
    }
    const reread = await ddb.send(new GetItemCommand({
      ConsistentRead: true,
      Key: treatmentSelectionKey(input.cognitoSub),
      TableName: requiredEnv("APP_TABLE_NAME"),
    }));
    return reread.Item?.recordType?.S === "onboardingTreatmentSelection" &&
        reread.Item.questionnaireId?.S === input.questionnaireId &&
        reread.Item.treatment?.S === input.treatment
      ? { ok: true }
      : { ok: false };
  }
}

async function saveMdiPatientLinkage(input: {
  cognitoSub: string;
  idempotencyKey: string;
  mdiPatientId: string;
  now: string;
}): Promise<{ ok: true } | { ok: false }> {
  try {
    await ddb.send(new TransactWriteItemsCommand({
      TransactItems: [
        {
          Put: {
            ConditionExpression: "attribute_not_exists(#pk) AND attribute_not_exists(#sk)",
            ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
            Item: mdiPatientOnlyLinkageItem(input),
            TableName: requiredEnv("APP_TABLE_NAME"),
          },
        },
        {
          Put: {
            ConditionExpression: "attribute_not_exists(#pk) AND attribute_not_exists(#sk)",
            ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
            Item: mdiPatientReverseItem(input),
            TableName: requiredEnv("APP_TABLE_NAME"),
          },
        },
        {
          Put: {
            Item: mdiPatientCreateAttemptItem({
              attempts: 1,
              cognitoSub: input.cognitoSub,
              idempotencyKey: input.idempotencyKey,
              linkedAt: input.now,
              mdiPatientId: input.mdiPatientId,
              now: input.now,
              status: "linked",
            }),
            TableName: requiredEnv("APP_TABLE_NAME"),
          },
        },
      ],
    }));
    return { ok: true };
  } catch (error) {
    if (isConditionalCheckFailed(error)) {
      const existing = await getMdiLinkage(input.cognitoSub);
      return existing?.mdiPatientId ? { ok: true } : { ok: false };
    }
    return { ok: false };
  }
}

async function linkMdiCaseIfAbsent(input: {
  cognitoSub: string;
  linkage: Required<MdiLinkage>;
  now: string;
}): Promise<{ ok: true } | { ok: false }> {
  try {
    await ddb.send(new UpdateItemCommand({
      ConditionExpression:
        "#recordType = :linkageType AND #mdiPatientId = :mdiPatientId AND (attribute_not_exists(#mdiCaseId) OR #mdiCaseId = :mdiCaseId)",
      ExpressionAttributeNames: {
        "#mdiCaseId": "mdiCaseId",
        "#mdiPatientId": "mdiPatientId",
        "#recordType": "recordType",
        "#updatedAt": "updatedAt",
      },
      ExpressionAttributeValues: {
        ":linkageType": { S: "mdiLinkage" },
        ":mdiCaseId": { S: input.linkage.mdiCaseId },
        ":mdiPatientId": { S: input.linkage.mdiPatientId },
        ":updatedAt": { S: input.now },
      },
      Key: mdiLinkageKey(input.cognitoSub),
      TableName: requiredEnv("APP_TABLE_NAME"),
      UpdateExpression: "SET #mdiCaseId = :mdiCaseId, #updatedAt = :updatedAt",
    }));
    return { ok: true };
  } catch (error) {
    if (isConditionalCheckFailed(error)) {
      const existing = await getMdiLinkage(input.cognitoSub);
      return existing?.mdiPatientId === input.linkage.mdiPatientId &&
          existing.mdiCaseId === input.linkage.mdiCaseId
        ? { ok: true }
        : { ok: false };
    }
    logStorageFailure("mdi_intake_link_case", error);
    return { ok: false };
  }
}

async function recordMdiCaseSubmittedAttempt(input: {
  cognitoSub: string;
  idempotencyKey: string;
  mdiCaseId: string;
  mdiPatientId: string;
  now: string;
  mdiSubmissionId?: string;
}): Promise<{ ok: true } | { ok: false }> {
  const existing = await getMdiCaseCreateAttempt(input.cognitoSub);
  try {
    await ddb.send(new PutItemCommand({
      Item: mdiCaseCreateAttemptItem({
        attempts: existing?.attempts ?? 1,
        cognitoSub: input.cognitoSub,
        idempotencyKey: existing?.idempotencyKey ?? input.idempotencyKey,
        linkedAt: input.now,
        mdiCaseId: input.mdiCaseId,
        mdiPatientId: input.mdiPatientId,
        mdiSubmissionId: input.mdiSubmissionId,
        now: existing?.createdAt ?? input.now,
        status: "submitted",
        submittedAt: input.now,
      }),
      TableName: requiredEnv("APP_TABLE_NAME"),
    }));
    return { ok: true };
  } catch (error) {
    logStorageFailure("mdi_intake_record_submitted_attempt", error);
    return { ok: false };
  }
}

function parseSubmissionBody(body: string | null | undefined):
  | {
      ok: true;
      value: {
        casePayload: MdiCasePayload;
        questionnaireId: string;
        responses: MdiIntakeResponse[];
      };
    }
  | { ok: false } {
  try {
    const parsed = body ? JSON.parse(body) : null;
    if (!isRecord(parsed)) {
      return { ok: false };
    }
    if (
      typeof parsed.questionnaireId !== "string" ||
      !isRecord(parsed.casePayload) ||
      !Array.isArray(parsed.responses)
    ) {
      return { ok: false };
    }
    const responses: MdiIntakeResponse[] = [];
    for (const response of parsed.responses) {
      if (!isRecord(response) || typeof response.questionId !== "string") {
        return { ok: false };
      }
      responses.push({
        questionId: response.questionId,
        value: response.value,
      });
    }
    return {
      ok: true,
      value: {
        casePayload: parsed.casePayload,
        questionnaireId: parsed.questionnaireId,
        responses,
      },
    };
  } catch {
    return { ok: false };
  }
}

function bodyForError(code: string) {
  return {
    code,
    ...(code === "precheck_required" ? { redirect: "/intake" } : {}),
  };
}

function csrfTokenFor(scope: "mdi-intake" | "mdi-patient", token: string) {
  return createHash("sha256")
    .update(`${scope}:${token}`)
    .digest("base64url");
}

function boundedText(value: unknown, min: number, max: number) {
  const text = stringValue(value);
  if (text.length < min || text.length > max) {
    return null;
  }
  return text;
}

function dateOnly(value: unknown) {
  const text = stringValue(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return null;
  }
  const parsed = new Date(`${text}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : text;
}

function emailAddress(value: unknown) {
  const text = stringValue(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) && text.length <= 254
    ? text
    : null;
}

function optionalInteger(value: unknown, min: number, max: number) {
  const text = stringValue(value);
  if (!text) {
    return null;
  }
  if (!/^\d+$/.test(text)) {
    return null;
  }
  const parsed = Number(text);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max
    ? parsed
    : null;
}

function phone(value: unknown) {
  const text = stringValue(value);
  return /^[+0-9().\-\s]{7,24}$/.test(text) ? text : null;
}

function stateCode(value: unknown) {
  const text = stringValue(value).toUpperCase();
  return /^[A-Z]{2}$/.test(text) ? text : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function zip(value: unknown) {
  const text = stringValue(value);
  return /^\d{5}(?:-\d{4})?$/.test(text) ? text : null;
}

function parseQuestionnaireMapping(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function publicProviderStatus(status: number) {
  if (status === 429 || status === 418 || status >= 500) {
    return 503;
  }
  return 502;
}

function toOnboardingStatus(value: string | undefined): MdiIntakeStatus | undefined {
  if (
    value === "profile_pending" ||
    value === "intake_ready" ||
    value === "mdi_submitted" ||
    value === "clinical_review" ||
    value === "billing_ready"
  ) {
    return value;
  }
  return undefined;
}

function isSubmittedStatus(status: MdiIntakeStatus | undefined) {
  return status === "mdi_submitted" ||
    status === "clinical_review" ||
    status === "billing_ready";
}

function profileKey(cognitoSub: string) {
  return {
    pk: { S: `PATIENT#${cognitoSub}` },
    sk: { S: "PROFILE" },
  };
}

function mdiLinkageKey(cognitoSub: string) {
  return {
    pk: { S: `PATIENT#${cognitoSub}` },
    sk: { S: "MDI#LINKAGE" },
  };
}

function treatmentSelectionKey(cognitoSub: string) {
  return {
    pk: { S: `PATIENT#${cognitoSub}` },
    sk: { S: "MDI#QUESTIONNAIRE_SELECTION" },
  };
}

function mdiPatientReverseKey(mdiPatientId: string) {
  return {
    pk: { S: `MDI#PATIENT#${mdiPatientId}` },
    sk: { S: "LOOKUP" },
  };
}

function consentKey(cognitoSub: string, consentKind: string, version: string) {
  return {
    pk: { S: `PATIENT#${cognitoSub}` },
    sk: { S: `CONSENT#${consentKind}#${version}` },
  };
}

function treatmentSelectionItem(input: {
  cognitoSub: string;
  now: string;
  questionnaireId: string;
  treatment: LaunchOfferingSlug;
}): Record<string, AttributeValue> {
  return {
    ...treatmentSelectionKey(input.cognitoSub),
    recordType: { S: "onboardingTreatmentSelection" },
    schemaVersion: { N: "1" },
    cognitoSub: { S: input.cognitoSub },
    questionnaireId: { S: input.questionnaireId },
    selectedAt: { S: input.now },
    treatment: { S: input.treatment },
    createdAt: { S: input.now },
    updatedAt: { S: input.now },
  };
}

function mdiPatientOnlyLinkageItem(input: {
  cognitoSub: string;
  mdiPatientId: string;
  now: string;
}): Record<string, AttributeValue> {
  return {
    ...mdiLinkageKey(input.cognitoSub),
    cognitoSub: { S: input.cognitoSub },
    createdAt: { S: input.now },
    mdiPatientId: { S: input.mdiPatientId },
    recordType: { S: "mdiLinkage" },
    schemaVersion: { N: "1" },
    updatedAt: { S: input.now },
  };
}

function mdiPatientReverseItem(input: {
  cognitoSub: string;
  mdiPatientId: string;
  now: string;
}): Record<string, AttributeValue> {
  return {
    ...mdiPatientReverseKey(input.mdiPatientId),
    cognitoSub: { S: input.cognitoSub },
    createdAt: { S: input.now },
    mdiPatientId: { S: input.mdiPatientId },
    pointerType: { S: "patient" },
    recordType: { S: "mdiReverseLookup" },
    schemaVersion: { N: "1" },
    updatedAt: { S: input.now },
  };
}

function mdiLinkageItem(input: {
  cognitoSub: string;
  linkage: MdiLinkage;
  now: string;
}): Record<string, AttributeValue> {
  return withoutUndefined({
    ...mdiLinkageKey(input.cognitoSub),
    cognitoSub: { S: input.cognitoSub },
    createdAt: { S: input.now },
    mdiCaseId: input.linkage.mdiCaseId ? { S: input.linkage.mdiCaseId } : undefined,
    mdiPatientId: { S: input.linkage.mdiPatientId },
    recordType: { S: "mdiLinkage" },
    schemaVersion: { N: "1" },
    updatedAt: { S: input.now },
  });
}

type MdiCaseCreateAttemptStatus =
  | "claiming_case"
  | "case_provider_retryable_failure"
  | "case_provider_terminal_failure"
  | "case_storage_retryable_failure"
  | "submitted";

type MdiCaseCreateAttempt = {
  attempts: number;
  cognitoSub: string;
  createdAt: string;
  idempotencyKey: string;
  status: MdiCaseCreateAttemptStatus;
  updatedAt: string;
  claimExpiresAt?: string;
  lastAttemptAt?: string;
  mdiCaseId?: string;
  mdiPatientId?: string;
};

type MdiPatientCreateAttemptStatus =
  | "claiming"
  | "provider_retryable_failure"
  | "provider_terminal_failure"
  | "storage_retryable_failure"
  | "linked";

function mdiPatientCreateAttemptKey(cognitoSub: string) {
  return {
    pk: { S: `PATIENT#${cognitoSub}` },
    sk: { S: "MDI#PATIENT_CREATE" },
  };
}

function mdiPatientCreateAttemptItem(input: {
  attempts: number;
  cognitoSub: string;
  idempotencyKey: string;
  now: string;
  status: MdiPatientCreateAttemptStatus;
  claimExpiresAt?: string;
  lastAttemptAt?: string;
  linkedAt?: string;
  mdiPatientId?: string;
  providerStatus?: number;
  retryAfterSeconds?: number;
}): Record<string, AttributeValue> {
  return withoutUndefined({
    ...mdiPatientCreateAttemptKey(input.cognitoSub),
    attempts: { N: String(input.attempts) },
    claimExpiresAt: input.claimExpiresAt ? { S: input.claimExpiresAt } : undefined,
    cognitoSub: { S: input.cognitoSub },
    createdAt: { S: input.now },
    idempotencyKey: { S: input.idempotencyKey },
    lastAttemptAt: input.lastAttemptAt ? { S: input.lastAttemptAt } : undefined,
    linkedAt: input.linkedAt ? { S: input.linkedAt } : undefined,
    mdiPatientId: input.mdiPatientId ? { S: input.mdiPatientId } : undefined,
    providerStatus: input.providerStatus ? { N: String(input.providerStatus) } : undefined,
    recordType: { S: "mdiPatientCreateAttempt" },
    retryAfterSeconds: input.retryAfterSeconds ? { N: String(input.retryAfterSeconds) } : undefined,
    schemaVersion: { N: "1" },
    status: { S: input.status },
    updatedAt: { S: input.now },
  });
}

function mdiCaseCreateAttemptKey(cognitoSub: string) {
  return {
    pk: { S: `PATIENT#${cognitoSub}` },
    sk: { S: "MDI#CASE_CREATE" },
  };
}

async function getMdiCaseCreateAttempt(cognitoSub: string): Promise<MdiCaseCreateAttempt | null> {
  const response = await ddb.send(new GetItemCommand({
    ConsistentRead: true,
    Key: mdiCaseCreateAttemptKey(cognitoSub),
    TableName: requiredEnv("APP_TABLE_NAME"),
  }));
  const item = response.Item;
  if (!item || item.recordType?.S !== "mdiCaseCreateAttempt") {
    return null;
  }
  const attempts = Number(item.attempts?.N);
  const idempotencyKey = item.idempotencyKey?.S;
  const status = item.status?.S;
  const createdAt = item.createdAt?.S;
  const updatedAt = item.updatedAt?.S;
  if (
    !Number.isInteger(attempts) ||
    !idempotencyKey ||
    !isMdiCaseCreateAttemptStatus(status) ||
    !createdAt ||
    !updatedAt
  ) {
    return null;
  }
  return {
    attempts,
    cognitoSub,
    createdAt,
    idempotencyKey,
    status,
    updatedAt,
    claimExpiresAt: item.claimExpiresAt?.S,
    lastAttemptAt: item.lastAttemptAt?.S,
    mdiCaseId: item.mdiCaseId?.S,
    mdiPatientId: item.mdiPatientId?.S,
  };
}

function mdiCaseCreateAttemptItem(input: {
  attempts: number;
  cognitoSub: string;
  idempotencyKey: string;
  now: string;
  status: MdiCaseCreateAttemptStatus;
  claimExpiresAt?: string;
  lastAttemptAt?: string;
  linkedAt?: string;
  submittedAt?: string;
  mdiPatientId?: string;
  mdiCaseId?: string;
  mdiSubmissionId?: string;
  providerStatus?: number;
  retryAfterSeconds?: number;
}): Record<string, AttributeValue> {
  return withoutUndefined({
    ...mdiCaseCreateAttemptKey(input.cognitoSub),
    attempts: { N: String(input.attempts) },
    claimExpiresAt: input.claimExpiresAt ? { S: input.claimExpiresAt } : undefined,
    cognitoSub: { S: input.cognitoSub },
    createdAt: { S: input.now },
    idempotencyKey: { S: input.idempotencyKey },
    lastAttemptAt: input.lastAttemptAt ? { S: input.lastAttemptAt } : undefined,
    linkedAt: input.linkedAt ? { S: input.linkedAt } : undefined,
    mdiCaseId: input.mdiCaseId ? { S: input.mdiCaseId } : undefined,
    mdiPatientId: input.mdiPatientId ? { S: input.mdiPatientId } : undefined,
    mdiSubmissionId: input.mdiSubmissionId ? { S: input.mdiSubmissionId } : undefined,
    providerStatus: input.providerStatus ? { N: String(input.providerStatus) } : undefined,
    retryAfterSeconds: input.retryAfterSeconds ? { N: String(input.retryAfterSeconds) } : undefined,
    recordType: { S: "mdiCaseCreateAttempt" },
    schemaVersion: { N: "1" },
    status: { S: input.status },
    submittedAt: input.submittedAt ? { S: input.submittedAt } : undefined,
    updatedAt: { S: input.now },
  });
}

function isMdiCaseCreateAttemptStatus(
  value: string | undefined,
): value is MdiCaseCreateAttemptStatus {
  return value === "claiming_case" ||
    value === "case_provider_retryable_failure" ||
    value === "case_provider_terminal_failure" ||
    value === "case_storage_retryable_failure" ||
    value === "submitted";
}

function claimExpiresAt(now: string) {
  return new Date(Date.parse(now) + 15 * 60 * 1000).toISOString();
}

function isExpired(timestamp: string | undefined, now: string) {
  if (!timestamp) {
    return true;
  }
  return Date.parse(timestamp) <= Date.parse(now);
}

function parseRetryAfterSeconds(value: string | null) {
  if (!value) {
    return undefined;
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return Math.min(Math.ceil(numeric), 3600);
  }
  const dateMs = Date.parse(value);
  if (!Number.isFinite(dateMs)) {
    return undefined;
  }
  return Math.min(Math.max(Math.ceil((dateMs - Date.now()) / 1000), 1), 3600);
}

function isAllowedOrigin(event: ApiEvent) {
  const origin = header(event, "origin");
  const referer = header(event, "referer");
  if (origin) {
    return allowedOrigins().has(origin);
  }
  return typeof referer === "string" &&
    Array.from(allowedOrigins()).some((allowed) =>
      referer === allowed || referer.startsWith(`${allowed}/`)
    );
}

function signAwsJsonRequest(input: {
  body: string;
  region: string;
  service: "secretsmanager";
  target: string;
}) {
  const accessKeyId = requiredEnv("AWS_ACCESS_KEY_ID");
  const secretAccessKey = requiredEnv("AWS_SECRET_ACCESS_KEY");
  const sessionToken = process.env.AWS_SESSION_TOKEN;
  const endpoint = new URL(`https://${input.service}.${input.region}.amazonaws.com/`);
  const amzDate = toAmzDate(new Date());
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256(input.body);
  const headers: Record<string, string> = {
    "content-type": "application/x-amz-json-1.1",
    host: endpoint.host,
    "x-amz-date": amzDate,
    "x-amz-target": input.target,
  };
  if (sessionToken) {
    headers["x-amz-security-token"] = sessionToken;
  }

  const signedHeaders = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaders
    .map((name) => `${name}:${headers[name]}`)
    .join("\n");
  const canonicalRequest = [
    "POST",
    endpoint.pathname,
    "",
    `${canonicalHeaders}\n`,
    signedHeaders.join(";"),
    payloadHash,
  ].join("\n");
  const credentialScope = `${dateStamp}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join("\n");
  const signingKey = getSignatureKey(
    secretAccessKey,
    dateStamp,
    input.region,
    input.service,
  );
  const signature = hmac(signingKey, stringToSign).toString("hex");

  return {
    ...headers,
    authorization: [
      `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}`,
      `SignedHeaders=${signedHeaders.join(";")}`,
      `Signature=${signature}`,
    ].join(", "),
  };
}

function getSignatureKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
  service: string,
) {
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, service);
  return hmac(serviceKey, "aws4_request");
}

function toAmzDate(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hmac(key: string | Buffer, value: string) {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function header(event: ApiEvent, name: string) {
  const lower = name.toLowerCase();
  const entry = Object.entries(event.headers ?? {}).find(
    ([key]) => key.toLowerCase() === lower,
  );
  return entry?.[1];
}

function cookieHeader(event: ApiEvent) {
  const headerCookie = header(event, "cookie");
  if (headerCookie) {
    return headerCookie;
  }
  return event.cookies?.join("; ");
}

function json(statusCode: number, body: Record<string, unknown>): ApiResponse {
  return {
    body: JSON.stringify(body),
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json",
    },
    statusCode,
  };
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function allowedOrigins() {
  const configured = (
    process.env.APOTH_ALLOWED_ORIGINS ??
    process.env.APOTH_ALLOWED_ORIGIN ??
    ""
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (configured.length === 0) {
    throw new Error("Missing required environment variable: APOTH_ALLOWED_ORIGINS");
  }
  return new Set(configured);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isConditionalCheckFailed(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "ConditionalCheckFailedException"
  );
}

function logStorageFailure(operation: string, error: unknown) {
  console.error("mdi_intake_storage_failed", {
    errorName: typeof error === "object" && error !== null && "name" in error
      ? String(error.name)
      : "UnknownError",
    operation,
  });
}

function withoutUndefined<T extends Record<string, AttributeValue | undefined>>(
  record: T,
): Record<string, AttributeValue> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as Record<string, AttributeValue>;
}
