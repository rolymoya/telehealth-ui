import { createHash, createHmac } from "node:crypto";
import {
  type AttributeValue,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  TransactWriteItemsCommand,
} from "@aws-sdk/client-dynamodb";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { currentRequiredConsents } from "../../../shared/consents";
import {
  parseCookieHeader,
  patientAccessCookieName,
} from "../../../shared/auth/session-cookie";
import {
  loadMdiIntake,
  mdiIntakeFailure,
  submitMdiIntake,
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

let testGateway: MdiIntakeGateway | null = null;

const ddb = new DynamoDBClient({});

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

  const consent = await hasCurrentConsent(auth.session.cognitoSub);
  if (!consent) {
    return json(403, {
      code: "consent_required",
      redirect: "/onboarding/consent",
    });
  }

  const result = await loadMdiIntake(
    { cognitoSub: auth.session.cognitoSub },
    {
      gateway: activeGateway(),
      repository: dynamoRepository(),
    },
  );
  if (!result.ok) {
    return json(result.error.status, bodyForError(result.error.code));
  }

  return json(200, {
    csrfToken: csrfTokenFor(auth.session.token),
    ...result.value,
  });
}

export async function submitHandler(event: ApiEvent): Promise<ApiResponse> {
  const csrf = await verifyCsrf(event);
  if (!csrf.ok) {
    return json(csrf.status, { code: csrf.code });
  }

  const consent = await hasCurrentConsent(csrf.session.cognitoSub);
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
      expectedQuestionnaireId: requiredEnv("APOTH_MDI_QUESTIONNAIRE_ID"),
      gateway: activeGateway(),
      repository: dynamoRepository(),
    },
  );
  if (!result.ok) {
    return json(result.error.status, bodyForError(result.error.code));
  }

  return json(200, result.value);
}

function activeGateway(): MdiIntakeGateway {
  return testGateway ?? productionMdiGateway();
}

function productionMdiGateway(): MdiIntakeGateway {
  return {
    async loadQuestionnaire(input) {
      if (!input.linkage?.mdiPatientId || !input.linkage.mdiCaseId) {
        return mdiIntakeFailure(
          "provider_unavailable",
          "MDI patient and case linkage is not available",
          { retryable: true, status: 503 },
        );
      }

      const questionnaireId = requiredEnv("APOTH_MDI_QUESTIONNAIRE_ID");
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
          caseId: input.linkage.mdiCaseId,
          questions: parsed.value,
        },
      };
    },
    async submitResponses(input) {
      const submitted = await requestMdi<unknown>({
        body: {
          caseId: input.caseId,
          patientId: input.patientId,
          responses: input.responses,
        },
        idempotencyKey: input.idempotencyKey,
        method: "POST",
        path: `/partner/questionnaires/${encodeURIComponent(input.questionnaireId)}/responses`,
      });
      if (!submitted.ok) {
        return submitted;
      }

      const parsed = parseMdiSubmission(submitted.value);
      if (!parsed.ok) {
        return parsed;
      }

      return {
        ok: true,
        value: {
          linkage: {
            mdiPatientId: input.patientId,
            mdiCaseId: input.caseId,
          },
          submissionId: parsed.value.submissionId,
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
        { retryable: response.status === 429 || response.status >= 500 || response.status === 418, status: response.status },
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
      try {
        await ddb.send(new TransactWriteItemsCommand({
          TransactItems: [
            {
              Update: {
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
              },
            },
            {
              Put: {
                Item: mdiLinkageItem(input),
                TableName: requiredEnv("APP_TABLE_NAME"),
              },
            },
          ],
        }));
        return {
          ok: true,
          value: input.linkage,
        };
      } catch {
        return mdiIntakeFailure(
          "storage_failed",
          "MDI intake status could not be stored",
          { retryable: true, status: 500 },
        );
      }
    },
    async claimSubmission(input) {
      const now = new Date().toISOString();
      const idempotencyKey = mdiSubmissionIdempotencyKey(input.cognitoSub);
      const leaseExpiresAt = new Date(
        new Date(now).getTime() + 10 * 60 * 1000,
      ).toISOString();
      try {
        await ddb.send(new PutItemCommand({
          ConditionExpression: "attribute_not_exists(#pk) OR #leaseExpiresAt < :now",
          ExpressionAttributeNames: {
            "#leaseExpiresAt": "leaseExpiresAt",
            "#pk": "pk",
          },
          ExpressionAttributeValues: {
            ":now": { S: now },
          },
          Item: {
            ...submissionClaimKey(input.cognitoSub),
            cognitoSub: { S: input.cognitoSub },
            createdAt: { S: now },
            idempotencyKey: { S: idempotencyKey },
            leaseExpiresAt: { S: leaseExpiresAt },
            recordType: { S: "mdiIntakeSubmissionClaim" },
            schemaVersion: { N: "1" },
            updatedAt: { S: now },
          },
          TableName: requiredEnv("APP_TABLE_NAME"),
        }));
        return { ok: true, value: { claimed: true, idempotencyKey } };
      } catch (error) {
        if (isConditionalCheckFailed(error)) {
          return mdiIntakeFailure(
            "submission_in_progress",
            "MDI intake submission is already in progress",
            { retryable: true, status: 409 },
          );
        }
        return mdiIntakeFailure(
          "storage_failed",
          "MDI intake submission could not be claimed",
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

function parseMdiSubmission(payload: unknown): ReturnType<typeof mdiIntakeFailure> | {
  ok: true;
  value: { submissionId?: string };
} {
  if (!isRecord(payload)) {
    return mdiIntakeFailure(
      "provider_unavailable",
      "MDI submission response was invalid",
      { retryable: false, status: 502 },
    );
  }

  const submissionId = payload.submissionId ?? payload.mdiSubmissionId ?? payload.id;
  if (typeof submissionId !== "string" || typeof payload.status !== "string") {
    return mdiIntakeFailure(
      "provider_unavailable",
      "MDI submission response fields were invalid",
      { retryable: false, status: 502 },
    );
  }

  return {
    ok: true,
    value: { submissionId },
  };
}

async function verifyCsrf(event: ApiEvent):
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
  if (!csrfHeader || csrfHeader !== csrfTokenFor(auth.session.token)) {
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

async function hasCurrentConsent(cognitoSub: string) {
  for (const consent of currentRequiredConsents) {
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

function parseSubmissionBody(body: string | null | undefined):
  | {
      ok: true;
      value: {
        questionnaireId: string;
        patientId: string;
        caseId: string;
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
      typeof parsed.patientId !== "string" ||
      typeof parsed.caseId !== "string" ||
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
        questionnaireId: parsed.questionnaireId,
        patientId: parsed.patientId,
        caseId: parsed.caseId,
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

function csrfTokenFor(token: string) {
  return createHash("sha256")
    .update(`mdi-intake:${token}`)
    .digest("base64url");
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

function submissionClaimKey(cognitoSub: string) {
  return {
    pk: { S: `PATIENT#${cognitoSub}` },
    sk: { S: "MDI#INTAKE#SUBMISSION_CLAIM" },
  };
}

function mdiSubmissionIdempotencyKey(cognitoSub: string) {
  return `mdi-intake-${sha256(`mdi-intake:${cognitoSub}`).slice(0, 32)}`;
}

function consentKey(cognitoSub: string, consentKind: string, version: string) {
  return {
    pk: { S: `PATIENT#${cognitoSub}` },
    sk: { S: `CONSENT#${consentKind}#${version}` },
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

function withoutUndefined<T extends Record<string, AttributeValue | undefined>>(
  record: T,
): Record<string, AttributeValue> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as Record<string, AttributeValue>;
}
