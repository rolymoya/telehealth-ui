import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  TransactWriteItemsCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import {
  consentAcknowledgementFieldName,
  currentRequiredConsents,
} from "../../../shared/consents";
import {
  parseCookieHeader,
  patientAccessCookieName,
} from "../../../shared/auth/session-cookie";

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
};

type AppRecord = {
  billingStatus?: string;
  mdiCaseId?: string;
  mdiPatientId?: string;
  onboardingStatus?: string;
  recordType?: string;
  residencyState?: string;
};

const ddb = new DynamoDBClient({});

export async function acceptHandler(event: ApiEvent): Promise<ApiResponse> {
  const request = validateJsonPost(event);
  if (!request.ok) {
    return json(request.status, { code: request.code });
  }

  const auth = await verifyCookieSession(event);
  if (!auth.ok) {
    return json(401, { code: auth.code });
  }

  const accepted = validateAcknowledgements(request.value);
  if (!accepted) {
    return json(422, { code: "missing_required_consent" });
  }

  const write = await recordCurrentConsentAcceptance(auth.session.cognitoSub);
  if (!write.ok) {
    return json(write.status, { code: write.code });
  }
  const profile = await advanceProfileAfterConsent(auth.session.cognitoSub);
  if (!profile.ok) {
    return json(profile.status, { code: profile.code });
  }

  return json(200, {
    destination: await nextOnboardingDestination(auth.session.cognitoSub),
    status: "consent_recorded",
  });
}

async function advanceProfileAfterConsent(cognitoSub: string):
  Promise<{ ok: true } | { ok: false; code: string; status: number }> {
  const now = new Date().toISOString();
  const response = await ddb.send(new GetItemCommand({
    ConsistentRead: true,
    Key: profileKey(cognitoSub),
    TableName: requiredEnv("APP_TABLE_NAME"),
  }));

  if (!response.Item) {
    try {
      await ddb.send(new PutItemCommand({
        ConditionExpression: "attribute_not_exists(#pk) AND attribute_not_exists(#sk)",
        ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
        Item: profileItem({
          cognitoSub,
          now,
          onboardingStatus: "intake_ready",
        }),
        TableName: requiredEnv("APP_TABLE_NAME"),
      }));
      return { ok: true };
    } catch (error) {
      if (isConditionalCheckFailed(error)) {
        const reread = await ddb.send(new GetItemCommand({
          ConsistentRead: true,
          Key: profileKey(cognitoSub),
          TableName: requiredEnv("APP_TABLE_NAME"),
        }));
        if (!reread.Item) {
          return { ok: false, code: "profile_update_failed", status: 500 };
        }
        return await advanceExistingProfileAfterConsent(cognitoSub, reread.Item, now);
      }
      return { ok: false, code: "profile_update_failed", status: 500 };
    }
  }

  return await advanceExistingProfileAfterConsent(cognitoSub, response.Item, now);
}

async function advanceExistingProfileAfterConsent(
  cognitoSub: string,
  item: Record<string, { S?: string }>,
  now: string,
): Promise<{ ok: true } | { ok: false; code: string; status: number }> {
  if (item.recordType?.S !== "patientProfile") {
    return { ok: false, code: "profile_key_conflict", status: 500 };
  }

  const status = item.onboardingStatus?.S;
  if (status && status !== "profile_pending") {
    return { ok: true };
  }

  try {
    await ddb.send(new UpdateItemCommand({
      ConditionExpression: "#recordType = :recordType AND (attribute_not_exists(#status) OR #status = :profilePending)",
      ExpressionAttributeNames: {
        "#recordType": "recordType",
        "#status": "onboardingStatus",
        "#updatedAt": "updatedAt",
      },
      ExpressionAttributeValues: {
        ":intakeReady": { S: "intake_ready" },
        ":profilePending": { S: "profile_pending" },
        ":recordType": { S: "patientProfile" },
        ":updatedAt": { S: now },
      },
      Key: profileKey(cognitoSub),
      TableName: requiredEnv("APP_TABLE_NAME"),
      UpdateExpression: "SET #status = :intakeReady, #updatedAt = :updatedAt",
    }));
    return { ok: true };
  } catch (error) {
    if (isConditionalCheckFailed(error)) {
      return { ok: true };
    }
    return { ok: false, code: "profile_update_failed", status: 500 };
  }
}

function validateJsonPost(event: ApiEvent):
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; code: string; status: number } {
  if (!isAllowedOrigin(event)) {
    return { ok: false, code: "invalid_origin", status: 403 };
  }

  if (!/^application\/json(?:;|$)/i.test(header(event, "content-type") ?? "")) {
    return { ok: false, code: "invalid_content_type", status: 415 };
  }

  const parsed = parseJsonBody(event.body);
  if (!parsed.ok) {
    return { ok: false, code: "invalid_json", status: 400 };
  }

  return parsed;
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
      session: { cognitoSub: sub },
    };
  } catch {
    return { ok: false, code: "invalid_session" };
  }
}

function validateAcknowledgements(body: Record<string, unknown>) {
  const acknowledgements = body.acknowledgements;
  if (
    !acknowledgements ||
    typeof acknowledgements !== "object" ||
    Array.isArray(acknowledgements)
  ) {
    return false;
  }

  const values = acknowledgements as Record<string, unknown>;
  return currentRequiredConsents.every((consent) =>
    values[consentAcknowledgementFieldName(consent)] === "accepted" ||
    values[consentAcknowledgementFieldName(consent)] === true
  );
}

async function recordCurrentConsentAcceptance(cognitoSub: string):
  Promise<{ ok: true } | { ok: false; code: string; status: number }> {
  const now = new Date().toISOString();
  const writes = [];

  for (const consent of currentRequiredConsents) {
    const response = await ddb.send(new GetItemCommand({
      ConsistentRead: true,
      Key: consentKey(cognitoSub, consent.consentKind, consent.version),
      TableName: requiredEnv("APP_TABLE_NAME"),
    }));

    if (response.Item) {
      if (response.Item.recordType?.S !== "consentEvidence") {
        return { ok: false, code: "consent_key_conflict", status: 500 };
      }
      continue;
    }

    writes.push({
      Put: {
        ConditionExpression: "attribute_not_exists(#pk) AND attribute_not_exists(#sk)",
        ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
        Item: consentEvidenceItem({
          acceptedAt: now,
          cognitoSub,
          consentKind: consent.consentKind,
          now,
          version: consent.version,
        }),
        TableName: requiredEnv("APP_TABLE_NAME"),
      },
    });
  }

  if (writes.length === 0) {
    return { ok: true };
  }

  try {
    await ddb.send(new TransactWriteItemsCommand({
      TransactItems: writes,
    }));
    return { ok: true };
  } catch (error) {
    if (isTransactionConflict(error)) {
      return await hasCurrentConsent(cognitoSub)
        ? { ok: true }
        : { ok: false, code: "consent_write_conflict", status: 409 };
    }
    return { ok: false, code: "consent_write_failed", status: 500 };
  }
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

async function nextOnboardingDestination(cognitoSub: string) {
  const profile = await readRecord(profileKey(cognitoSub));
  if (profile?.recordType && profile.recordType !== "patientProfile") {
    return "/intake";
  }
  if (
    !profile?.onboardingStatus ||
    profile.onboardingStatus === "profile_pending" ||
    (profile.onboardingStatus === "intake_ready" && !profile.residencyState)
  ) {
    return "/intake";
  }

  const mdi = await readRecord(mdiLinkageKey(cognitoSub));
  if (
    profile.onboardingStatus === "mdi_submitted" ||
    profile.onboardingStatus !== "billing_ready" ||
    !mdi?.mdiPatientId ||
    !mdi.mdiCaseId
  ) {
    return "/onboarding/mdi";
  }

  const stripe = await readRecord(stripeLinkageKey(cognitoSub));
  if (
    stripe?.billingStatus !== "payment_method_collected" &&
    stripe?.billingStatus !== "active"
  ) {
    return "/billing";
  }

  return "/dashboard";
}

async function readRecord(key: ReturnType<typeof profileKey>): Promise<AppRecord | null> {
  const response = await ddb.send(new GetItemCommand({
    ConsistentRead: true,
    Key: key,
    TableName: requiredEnv("APP_TABLE_NAME"),
  }));
  if (!response.Item) {
    return null;
  }
  return {
    billingStatus: response.Item.billingStatus?.S,
    mdiCaseId: response.Item.mdiCaseId?.S,
    mdiPatientId: response.Item.mdiPatientId?.S,
    onboardingStatus: response.Item.onboardingStatus?.S,
    recordType: response.Item.recordType?.S,
    residencyState: response.Item.residencyState?.S,
  };
}

function verifier() {
  return CognitoJwtVerifier.create({
    clientId: requiredEnv("COGNITO_USER_POOL_CLIENT_ID"),
    tokenUse: "access",
    userPoolId: requiredEnv("COGNITO_USER_POOL_ID"),
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

function consentEvidenceItem(input: {
  acceptedAt: string;
  cognitoSub: string;
  consentKind: string;
  now: string;
  version: string;
}) {
  return {
    ...consentKey(input.cognitoSub, input.consentKind, input.version),
    acceptedAt: { S: input.acceptedAt },
    cognitoSub: { S: input.cognitoSub },
    consentKind: { S: input.consentKind },
    createdAt: { S: input.now },
    recordType: { S: "consentEvidence" },
    schemaVersion: { N: "1" },
    updatedAt: { S: input.now },
    version: { S: input.version },
  };
}

function profileItem(input: {
  cognitoSub: string;
  now: string;
  onboardingStatus: string;
}) {
  return {
    ...profileKey(input.cognitoSub),
    cognitoSub: { S: input.cognitoSub },
    createdAt: { S: input.now },
    onboardingStatus: { S: input.onboardingStatus },
    recordType: { S: "patientProfile" },
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

function mdiLinkageKey(cognitoSub: string) {
  return {
    pk: { S: `PATIENT#${cognitoSub}` },
    sk: { S: "MDI#LINKAGE" },
  };
}

function stripeLinkageKey(cognitoSub: string) {
  return {
    pk: { S: `PATIENT#${cognitoSub}` },
    sk: { S: "STRIPE#LINKAGE" },
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

function isTransactionConflict(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (
      error.name === "TransactionCanceledException" ||
      error.name === "ConditionalCheckFailedException"
    )
  );
}

function isConditionalCheckFailed(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "ConditionalCheckFailedException"
  );
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
