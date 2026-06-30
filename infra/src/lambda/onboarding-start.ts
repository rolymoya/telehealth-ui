import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  TransactWriteItemsCommand,
} from "@aws-sdk/client-dynamodb";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import {
  parseCookieHeader,
  patientAccessCookieName,
} from "../../../shared/auth/session-cookie";
import {
  requiredConsentsBeforeMdi,
  requiredConsentsForCurrentOnboarding,
} from "../../../shared/consents";
import {
  anonymousPrecheckContextCookieName,
  anonymousPrecheckNonceHash,
  clearedAnonymousPrecheckContextCookieHeader,
  verifyAnonymousPrecheckContext,
  type AnonymousPrecheckContextPayload,
  type AppSigningSecret,
} from "../../../shared/intake/anonymous-precheck-context";
import {
  resolveRuntimeStage,
  resolveStartupSecretSource,
  validateServerStartupSecrets,
} from "../../../src/lib/secrets/startup.js";

type ApiEvent = {
  cookies?: string[];
  headers?: Record<string, string | undefined>;
};

type ApiResponse = {
  body: string;
  cookies?: string[];
  headers: Record<string, string>;
  statusCode: number;
};

type PatientProfile = {
  onboardingStatus: string;
  residencyState?: string;
};

const ddb = new DynamoDBClient({});

export async function startHandler(event: ApiEvent): Promise<ApiResponse> {
  const session = await verifyCookieSession(event);
  if (!session.ok) {
    return json(401, {
      code: session.code,
      primaryAction: {
        href: "/sign-up?returnTo=%2Fget-started",
        label: "Create account",
      },
      secondaryAction: {
        href: "/sign-in?returnTo=%2Fget-started",
        label: "Sign in",
      },
      status: "account_required",
    });
  }

  const anonymousCookie = parseCookieHeader(cookieHeader(event))
    .get(anonymousPrecheckContextCookieName);
  const anonymousContext = anonymousCookie
    ? await readAnonymousContext(anonymousCookie)
    : { ok: true as const, payload: undefined };
  if (!anonymousContext.ok) {
    return json(503, { code: "onboarding_unavailable" });
  }

  const profile = anonymousContext.payload
    ? await bindAnonymousPrecheck(session.cognitoSub, anonymousContext.payload)
    : await ensureProfile(session.cognitoSub);
  if (!profile.ok) {
    return json(profile.status, { code: profile.code });
  }

  const destination = await destinationForStart(session.cognitoSub, profile.profile);

  return json(200, {
    destination,
    status: "ready",
  }, anonymousCookie ? {
    cookies: [clearedAnonymousPrecheckContextCookieHeader()],
  } : {});
}

async function readAnonymousContext(value: string): Promise<
  | { ok: true; payload?: AnonymousPrecheckContextPayload }
  | { ok: false }
> {
  const secret = await loadAppSigningSecret();
  if (!secret.ok) {
    return { ok: false };
  }
  const verified = verifyAnonymousPrecheckContext({
    secret: secret.value,
    value,
  });
  return verified.ok
    ? { ok: true, payload: verified.payload }
    : { ok: true };
}

async function verifyCookieSession(event: ApiEvent):
  Promise<
    | { ok: true; cognitoSub: string }
    | { ok: false; code: "missing_session" | "invalid_session" }
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
    return { ok: true, cognitoSub: sub };
  } catch {
    return { ok: false, code: "invalid_session" };
  }
}

async function bindAnonymousPrecheck(
  cognitoSub: string,
  context: AnonymousPrecheckContextPayload,
): Promise<
  | { ok: true; profile: PatientProfile }
  | { ok: false; code: string; status: number }
> {
  const nonceHash = anonymousPrecheckNonceHash(context);
  const consumed = await getConsumption(nonceHash);
  if (!consumed.ok) {
    return { ok: false, code: consumed.code, status: consumed.status };
  }
  if (consumed.record && consumed.record.cognitoSub !== cognitoSub) {
    return { ok: true, profile: recoverAtIntakeProfile() };
  }
  const existing = await getProfile(cognitoSub);
  const profile = existing.ok ? existing.profile : null;
  if (!existing.ok && existing.status !== 404) {
    return existing;
  }

  if (consumed.record) {
    return {
      ok: true,
      profile: isSameAccountReplayRecovered(profile, context.residencyState)
        ? profile ?? createDefaultProfile()
        : recoverAtIntakeProfile(),
    };
  }

  if (!profile) {
    const now = new Date().toISOString();
    const next = {
      onboardingStatus: "intake_ready",
      residencyState: context.residencyState,
    };
    const written = await transactBind([
      {
        Put: {
          ConditionExpression: "attribute_not_exists(#pk) AND attribute_not_exists(#sk)",
          ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
          Item: profileItemWithStatus(cognitoSub, now, next),
          TableName: requiredEnv("APP_TABLE_NAME"),
        },
      },
      consumptionPut(cognitoSub, context, nonceHash),
    ]);
    return finishBindWrite(written, { ok: true, profile: next }, cognitoSub, context);
  }

  if (profile.onboardingStatus === "profile_pending") {
    const next = {
      onboardingStatus: "intake_ready",
      residencyState: context.residencyState,
    };
    const written = await transactBind([
      profileUpdate(cognitoSub, {
        expectedStatus: "profile_pending",
        next,
      }),
      consumptionPut(cognitoSub, context, nonceHash),
    ]);
    return finishBindWrite(written, { ok: true, profile: next }, cognitoSub, context);
  }

  if (
    profile.onboardingStatus === "intake_ready" &&
    (!profile.residencyState || profile.residencyState === context.residencyState)
  ) {
    const operations = [consumptionPut(cognitoSub, context, nonceHash)];
    if (!profile.residencyState) {
      operations.unshift(profileUpdate(cognitoSub, {
        expectedStatus: "intake_ready",
        expectedResidencyState: null,
        next: {
          onboardingStatus: "intake_ready",
          residencyState: context.residencyState,
        },
      }));
    }
    const written = await transactBind(operations);
    return finishBindWrite(written, {
      ok: true,
      profile: {
        onboardingStatus: "intake_ready",
        residencyState: context.residencyState,
      },
    }, cognitoSub, context);
  }

  try {
    await ddb.send(new PutItemCommand(consumptionPut(cognitoSub, context, nonceHash).Put));
    return {
      ok: true,
      profile: profile.onboardingStatus === "intake_ready"
        ? recoverAtIntakeProfile()
        : profile,
    };
  } catch (error) {
    return isConditionalCheckFailed(error)
      ? recoverAfterConsumptionConflict(cognitoSub, context)
      : { ok: false, code: "anonymous_precheck_bind_failed", status: 500 };
  }
}

async function ensureProfile(cognitoSub: string): Promise<
  | { ok: true; profile: PatientProfile }
  | { ok: false; code: string; status: number }
> {
  const existing = await getProfile(cognitoSub);
  if (existing.ok) {
    return { ok: true, profile: existing.profile ?? createDefaultProfile() };
  }
  if (existing.status !== 404) {
    return existing;
  }

  try {
    await ddb.send(new PutItemCommand({
      ConditionExpression: "attribute_not_exists(#pk) AND attribute_not_exists(#sk)",
      ExpressionAttributeNames: {
        "#pk": "pk",
        "#sk": "sk",
      },
      Item: profileItem(cognitoSub, new Date().toISOString()),
      TableName: requiredEnv("APP_TABLE_NAME"),
    }));
    return { ok: true, profile: createDefaultProfile() };
  } catch (error) {
    if (isConditionalCheckFailed(error)) {
      const reread = await getProfile(cognitoSub);
      if (reread.ok && reread.profile) {
        return { ok: true, profile: reread.profile };
      }
    }
    return { ok: false, code: "profile_start_failed", status: 500 };
  }
}

async function getProfile(cognitoSub: string): Promise<
  | { ok: true; profile: PatientProfile | null }
  | { ok: false; code: string; status: number }
> {
  const response = await ddb.send(new GetItemCommand({
    ConsistentRead: true,
    Key: profileKey(cognitoSub),
    TableName: requiredEnv("APP_TABLE_NAME"),
  }));
  if (!response.Item) {
    return { ok: false, code: "profile_not_found", status: 404 };
  }
  if (response.Item.recordType?.S !== "patientProfile") {
    return { ok: false, code: "profile_invalid", status: 500 };
  }
  return {
    ok: true,
    profile: {
      onboardingStatus: response.Item.onboardingStatus?.S ?? "profile_pending",
      residencyState: response.Item.residencyState?.S,
    },
  };
}

async function getConsumption(nonceHash: string): Promise<
  | { ok: true; record: { cognitoSub: string } | null }
  | { ok: false; code: string; status: number }
> {
  const response = await ddb.send(new GetItemCommand({
    ConsistentRead: true,
    Key: anonymousPrecheckConsumptionKey(nonceHash),
    TableName: requiredEnv("APP_TABLE_NAME"),
  }));
  if (!response.Item) {
    return { ok: true, record: null };
  }
  if (response.Item.recordType?.S !== "anonymousPrecheckConsumption") {
    return { ok: false, code: "anonymous_precheck_consumption_invalid", status: 500 };
  }
  const cognitoSub = response.Item.cognitoSub?.S;
  return typeof cognitoSub === "string" && cognitoSub
    ? { ok: true, record: { cognitoSub } }
    : { ok: false, code: "anonymous_precheck_consumption_invalid", status: 500 };
}

async function recoverAfterConsumptionConflict(
  cognitoSub: string,
  context: AnonymousPrecheckContextPayload,
): Promise<
  | { ok: true; profile: PatientProfile }
  | { ok: false; code: string; status: number }
> {
  const consumed = await getConsumption(anonymousPrecheckNonceHash(context));
  if (!consumed.ok) {
    return consumed;
  }
  if (!consumed.record) {
    return { ok: false, code: "anonymous_precheck_bind_failed", status: 500 };
  }
  const profile = await getProfile(cognitoSub);
  if (!profile.ok && profile.status !== 404) {
    return profile;
  }
  if (consumed.record.cognitoSub !== cognitoSub) {
    return { ok: true, profile: recoverAtIntakeProfile() };
  }
  const profileValue = profile.ok ? profile.profile : null;
  return {
    ok: true,
    profile: isSameAccountReplayRecovered(profileValue, context.residencyState)
      ? profileValue ?? createDefaultProfile()
      : recoverAtIntakeProfile(),
  };
}

async function finishBindWrite<T extends { ok: true; profile: PatientProfile }>(
  written: { ok: true } | { ok: false; code: "conflict" | "failed" },
  success: T,
  cognitoSub: string,
  context: AnonymousPrecheckContextPayload,
) {
  if (written.ok) {
    return success;
  }
  return written.code === "conflict"
    ? recoverAfterConsumptionConflict(cognitoSub, context)
    : { ok: false as const, code: "anonymous_precheck_bind_failed", status: 500 };
}

async function transactBind(transactItems: Record<string, unknown>[]) {
  try {
    await ddb.send(new TransactWriteItemsCommand({
      TransactItems: transactItems,
    }));
    return { ok: true as const };
  } catch (error) {
    return isConditionalCheckFailed(error)
      ? { ok: false as const, code: "conflict" }
      : { ok: false as const, code: "failed" };
  }
}

function consumptionPut(
  cognitoSub: string,
  context: AnonymousPrecheckContextPayload,
  nonceHash: string,
) {
  const now = new Date().toISOString();
  return {
    Put: {
      ConditionExpression: "attribute_not_exists(#pk) AND attribute_not_exists(#sk)",
      ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
      Item: {
        ...anonymousPrecheckConsumptionKey(nonceHash),
        cognitoSub: { S: cognitoSub },
        consumedAt: { S: now },
        createdAt: { S: now },
        expiresAt: { S: context.expiresAt },
        expiresAtEpochSeconds: { N: String(Math.floor(Date.parse(context.expiresAt) / 1000)) },
        nonceHash: { S: nonceHash },
        recordType: { S: "anonymousPrecheckConsumption" },
        schemaVersion: { N: "1" },
        updatedAt: { S: now },
      },
      TableName: requiredEnv("APP_TABLE_NAME"),
    },
  };
}

function profileUpdate(
  cognitoSub: string,
  input: {
    expectedStatus: string;
    expectedResidencyState?: string | null;
    next: PatientProfile;
  },
) {
  const residencyCondition = input.expectedResidencyState === undefined
    ? ""
    : input.expectedResidencyState === null
    ? " AND attribute_not_exists(#residencyState)"
    : " AND #residencyState = :expectedResidencyState";
  return {
    Update: {
      ConditionExpression: `#status = :expected${residencyCondition}`,
      ExpressionAttributeNames: {
        "#status": "onboardingStatus",
        "#updatedAt": "updatedAt",
        "#residencyState": "residencyState",
      },
      ExpressionAttributeValues: {
        ":expected": { S: input.expectedStatus },
        ...(input.expectedResidencyState
          ? { ":expectedResidencyState": { S: input.expectedResidencyState } }
          : {}),
        ":nextStatus": { S: input.next.onboardingStatus },
        ":now": { S: new Date().toISOString() },
        ":residencyState": { S: input.next.residencyState ?? "" },
      },
      Key: profileKey(cognitoSub),
      TableName: requiredEnv("APP_TABLE_NAME"),
      UpdateExpression: "SET #status = :nextStatus, #residencyState = :residencyState, #updatedAt = :now",
    },
  };
}

function isSameAccountReplayRecovered(
  profile: PatientProfile | null,
  residencyState: string,
) {
  if (!profile) {
    return false;
  }
  if (profile.onboardingStatus === "intake_ready") {
    return profile.residencyState === residencyState;
  }
  return profile.onboardingStatus !== "profile_pending";
}

function destinationForProfile(profile: PatientProfile) {
  switch (profile.onboardingStatus) {
    case "intake_ready":
      return profile.residencyState ? "/onboarding/mdi" : "/intake";
    case "mdi_submitted":
    case "clinical_review":
      return "/onboarding/mdi";
    case "billing_ready":
      return "/billing";
    default:
      return "/onboarding/consent";
  }
}

async function destinationForStart(
  cognitoSub: string,
  profile: PatientProfile,
) {
  const destination = destinationForProfile(profile);
  if (destination === "/onboarding/consent") {
    return destination;
  }
  return await hasRequiredConsentForDestination(cognitoSub, destination)
    ? destination
    : "/onboarding/consent";
}

async function hasRequiredConsentForDestination(
  cognitoSub: string,
  destination: string,
) {
  const requiredConsents = destination === "/billing" || destination === "/dashboard"
    ? requiredConsentsForCurrentOnboarding()
    : requiredConsentsBeforeMdi();
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

function createDefaultProfile(): PatientProfile {
  return { onboardingStatus: "profile_pending" };
}

function recoverAtIntakeProfile(): PatientProfile {
  return { onboardingStatus: "intake_ready" };
}

function profileItem(cognitoSub: string, now: string) {
  return profileItemWithStatus(cognitoSub, now, {
    onboardingStatus: "profile_pending",
  });
}

function profileItemWithStatus(
  cognitoSub: string,
  now: string,
  profile: PatientProfile,
) {
  return {
    ...profileKey(cognitoSub),
    cognitoSub: { S: cognitoSub },
    createdAt: { S: now },
    onboardingStatus: { S: profile.onboardingStatus },
    recordType: { S: "patientProfile" },
    ...(profile.residencyState ? { residencyState: { S: profile.residencyState } } : {}),
    schemaVersion: { N: "1" },
    updatedAt: { S: now },
  };
}

function profileKey(cognitoSub: string) {
  return {
    pk: { S: `PATIENT#${cognitoSub}` },
    sk: { S: "PROFILE" },
  };
}

function anonymousPrecheckConsumptionKey(nonceHash: string) {
  return {
    pk: { S: `ANON_PRECHECK#${nonceHash}` },
    sk: { S: "CONSUMED" },
  };
}

function consentKey(cognitoSub: string, consentKind: string, version: string) {
  return {
    pk: { S: `PATIENT#${cognitoSub}` },
    sk: { S: `CONSENT#${consentKind}#${version}` },
  };
}

function cookieHeader(event: ApiEvent) {
  if (event.cookies?.length) {
    return event.cookies.join("; ");
  }
  return header(event, "cookie") ?? "";
}

function header(event: ApiEvent, name: string) {
  const headers = event.headers ?? {};
  const match = Object.entries(headers).find(([key]) =>
    key.toLowerCase() === name.toLowerCase()
  );
  return match?.[1];
}

function verifier() {
  return CognitoJwtVerifier.create({
    clientId: requiredEnv("COGNITO_USER_POOL_CLIENT_ID"),
    tokenUse: "access",
    userPoolId: requiredEnv("COGNITO_USER_POOL_ID"),
  });
}

async function loadAppSigningSecret(): Promise<
  | { ok: true; value: AppSigningSecret }
  | { ok: false }
> {
  const source = resolveStartupSecretSource({
    env: process.env,
    requiredSecrets: ["appSigning"],
  });
  if (!source.ok) {
    return { ok: false };
  }
  const validated = await validateServerStartupSecrets({
    stage: resolveRuntimeStage(process.env),
    requiredSecrets: ["appSigning"],
    source: source.value.source,
  });
  if (!validated.ok) {
    return { ok: false };
  }
  const secret = validated.value.find((value) =>
    value.secretKind === "appSigning"
  );
  return secret && secret.secretKind === "appSigning"
    ? {
        ok: true,
        value: {
          signingSecret: secret.signingSecret,
          signingSecretPrevious: secret.signingSecretPrevious,
          signingSecretPreviousExpiresAt: secret.signingSecretPreviousExpiresAt,
        },
      }
    : { ok: false };
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function isConditionalCheckFailed(error: unknown) {
  return error instanceof Error &&
    (error.name === "ConditionalCheckFailedException" ||
      error.name === "TransactionCanceledException");
}

function json(
  statusCode: number,
  body: Record<string, unknown>,
  options: { cookies?: string[] } = {},
): ApiResponse {
  return {
    body: JSON.stringify(body),
    ...(options.cookies ? { cookies: options.cookies } : {}),
    headers: {
      "content-type": "application/json",
    },
    statusCode,
  };
}
