import { createHash } from "node:crypto";
import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { currentRequiredConsents } from "../../../shared/consents";
import {
  screenIntakePrecheck,
  type IntakePrecheckFailure,
} from "../../../shared/intake/precheck";
import {
  parseCookieHeader,
  patientAccessCookieName,
} from "../../../shared/auth/session-cookie";

type ApiEvent = {
  body?: string | null;
  cookies?: string[];
  headers?: Record<string, string | undefined>;
  requestContext?: {
    http?: {
      method?: string;
      sourceIp?: string;
    };
  };
};

type ApiResponse = {
  body: string;
  headers: Record<string, string>;
  statusCode: number;
};

type PatientProfile = {
  onboardingStatus: string;
  residencyState?: string;
};

type VerifiedSession = {
  cognitoSub: string;
  token: string;
};

const ddb = new DynamoDBClient({});

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

  const profile = await getProfile(auth.session.cognitoSub);
  return json(200, {
    csrfToken: csrfTokenFor(auth.session.token),
    profile: profile
      ? {
          onboardingStatus: profile.onboardingStatus,
          residencyState: profile.residencyState ?? null,
        }
      : null,
    status: "ready_for_precheck",
  });
}

export async function precheckHandler(event: ApiEvent): Promise<ApiResponse> {
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

  const parsed = parseJsonBody(event.body);
  if (!parsed.ok) {
    return json(400, { code: "invalid_json" });
  }

  const precheck = screenIntakePrecheck(parsed.value);
  if (!precheck.ok) {
    return json(statusForPrecheckFailure(precheck.error), {
      code: precheck.error.reason,
      outcome: precheck.error.outcome,
    });
  }

  const completed = await completeProfile({
    cognitoSub: csrf.session.cognitoSub,
    now: new Date().toISOString(),
    residencyState: precheck.value.residencyState,
  });
  if (!completed.ok) {
    return json(completed.status, { code: completed.code });
  }

  return json(200, {
    residencyState: completed.residencyState,
    status: completed.status,
  });
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
    onboardingStatus: response.Item.onboardingStatus?.S ?? "",
    residencyState: response.Item.residencyState?.S,
  };
}

async function completeProfile(input: {
  cognitoSub: string;
  now: string;
  residencyState: string;
}): Promise<
  | { ok: true; residencyState: string; status: "ready_for_mdi_intake" | "already_advanced" }
  | { ok: false; code: string; status: number }
> {
  const profile = await getProfile(input.cognitoSub);
  if (!profile) {
    try {
      await ddb.send(new PutItemCommand({
        ConditionExpression: "attribute_not_exists(#pk) AND attribute_not_exists(#sk)",
        ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
        Item: profileItem(input),
        TableName: requiredEnv("APP_TABLE_NAME"),
      }));
      return {
        ok: true,
        residencyState: input.residencyState,
        status: "ready_for_mdi_intake",
      };
    } catch (error) {
      if (isConditionalCheckFailed(error)) {
        return completeProfileAfterConflict(input);
      }
      return {
        ok: false,
        code: "profile_update_failed",
        status: 500,
      };
    }
  }

  if (profile.onboardingStatus === "profile_pending") {
    return updateProfile(input, "profile_pending");
  }

  if (profile.onboardingStatus === "intake_ready") {
    if (profile.residencyState === input.residencyState) {
      return {
        ok: true,
        residencyState: input.residencyState,
        status: "ready_for_mdi_intake",
      };
    }
    if (!profile.residencyState) {
      return updateProfile(input, "intake_ready", {
        requireMissingResidencyState: true,
      });
    }
    return {
      ok: false,
      code: "residency_conflict",
      status: 409,
    };
  }

  return {
    ok: true,
    residencyState: profile.residencyState ?? input.residencyState,
    status: "already_advanced",
  };
}

async function updateProfile(
  input: {
    cognitoSub: string;
    now: string;
    residencyState: string;
  },
  expectedStatus: "profile_pending" | "intake_ready",
  options: { requireMissingResidencyState?: boolean } = {},
): ReturnType<typeof completeProfile> {
  try {
    await ddb.send(new UpdateItemCommand({
      ConditionExpression: [
        "#recordType = :recordType",
        "#onboardingStatus = :expected",
        ...(options.requireMissingResidencyState
          ? ["attribute_not_exists(#residencyState)"]
          : []),
      ].join(" AND "),
      ExpressionAttributeNames: {
        "#onboardingStatus": "onboardingStatus",
        "#recordType": "recordType",
        "#residencyState": "residencyState",
        "#updatedAt": "updatedAt",
      },
      ExpressionAttributeValues: {
        ":expected": { S: expectedStatus },
        ":next": { S: "intake_ready" },
        ":recordType": { S: "patientProfile" },
        ":residencyState": { S: input.residencyState },
        ":updatedAt": { S: input.now },
      },
      Key: profileKey(input.cognitoSub),
      TableName: requiredEnv("APP_TABLE_NAME"),
      UpdateExpression: "SET #onboardingStatus = :next, #residencyState = :residencyState, #updatedAt = :updatedAt",
    }));
    return {
      ok: true,
      residencyState: input.residencyState,
      status: "ready_for_mdi_intake",
    };
  } catch (error) {
    if (isConditionalCheckFailed(error)) {
      return completeProfileAfterConflict(input);
    }
    return {
      ok: false,
      code: "profile_update_failed",
      status: 500,
    };
  }
}

async function completeProfileAfterConflict(input: {
  cognitoSub: string;
  residencyState: string;
}) {
  const profile = await getProfile(input.cognitoSub);
  if (
    profile?.onboardingStatus === "intake_ready" &&
    profile.residencyState === input.residencyState
  ) {
    return {
      ok: true as const,
      residencyState: input.residencyState,
      status: "ready_for_mdi_intake" as const,
    };
  }
  return {
    ok: false as const,
    code: "profile_conflict",
    status: 409,
  };
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

function csrfTokenFor(token: string) {
  return createHash("sha256")
    .update(`intake-precheck:${token}`)
    .digest("base64url");
}

function profileItem(input: {
  cognitoSub: string;
  now: string;
  residencyState: string;
}) {
  return {
    ...profileKey(input.cognitoSub),
    cognitoSub: { S: input.cognitoSub },
    createdAt: { S: input.now },
    onboardingStatus: { S: "intake_ready" },
    recordType: { S: "patientProfile" },
    residencyState: { S: input.residencyState },
    schemaVersion: { N: "1" },
    updatedAt: { S: input.now },
  };
}

function profileKey(cognitoSub: string) {
  return {
    pk: { S: `PATIENT#${cognitoSub}` },
    sk: { S: "PROFILE" },
  };
}

function consentKey(cognitoSub: string, consentKind: string, version: string) {
  return {
    pk: { S: `PATIENT#${cognitoSub}` },
    sk: { S: `CONSENT#${consentKind}#${version}` },
  };
}

function parseJsonBody(body: string | null | undefined):
  | { ok: true; value: Record<string, unknown> }
  | { ok: false } {
  try {
    const parsed = body ? JSON.parse(body) : null;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? { ok: true, value: parsed as Record<string, unknown> }
      : { ok: false };
  } catch {
    return { ok: false };
  }
}

function isConditionalCheckFailed(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "ConditionalCheckFailedException"
  );
}

function statusForPrecheckFailure(error: IntakePrecheckFailure) {
  if (error.outcome === "incomplete") {
    return 422;
  }
  if (error.outcome === "ineligible" || error.outcome === "needs_clinician_review") {
    return 409;
  }
  return 400;
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
