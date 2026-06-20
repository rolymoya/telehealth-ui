import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import {
  parseCookieHeader,
  patientAccessCookieName,
} from "../../../shared/auth/session-cookie";

type ApiEvent = {
  cookies?: string[];
  headers?: Record<string, string | undefined>;
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

  const profile = await ensureProfile(session.cognitoSub);
  if (!profile.ok) {
    return json(profile.status, { code: profile.code });
  }

  return json(200, {
    destination: destinationForProfile(profile.profile),
    status: "ready",
  });
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

function createDefaultProfile(): PatientProfile {
  return { onboardingStatus: "profile_pending" };
}

function profileItem(cognitoSub: string, now: string) {
  return {
    ...profileKey(cognitoSub),
    cognitoSub: { S: cognitoSub },
    createdAt: { S: now },
    onboardingStatus: { S: "profile_pending" },
    recordType: { S: "patientProfile" },
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

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function isConditionalCheckFailed(error: unknown) {
  return error instanceof Error && error.name === "ConditionalCheckFailedException";
}

function json(statusCode: number, body: Record<string, unknown>): ApiResponse {
  return {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
    },
    statusCode,
  };
}
