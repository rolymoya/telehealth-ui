import "server-only";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  resolveCognitoAuthConfig,
  type AuthTokenVerifier,
  type CognitoAuthConfig,
} from "@/lib/auth";
import { patientAccessCookieName } from "@/lib/auth/session-cookie";
import {
  createDynamoDbAppDataReadRepository,
  resolveDynamoDbAppDataConfig,
} from "@/lib/dynamodb/app-data-dynamodb";
import { signInRedirectFor } from "@/lib/onboarding-gates";
import {
  e2eAuthHeaderName,
  type E2eProtectedRouteBypassInput,
} from "@/lib/e2e-auth";
import type { AppDataReadRepository } from "@/lib/onboarding-status";
import { evaluateProtectedRouteAccess } from "@/lib/protected-routes";

export const currentConsentVersion = "2026-06-legal-v1";

export type ProtectedPageAccessInput = {
  config?: CognitoAuthConfig;
  consentVersion?: string;
  e2eAuth?: E2eProtectedRouteBypassInput;
  now?: Date;
  pathname: string;
  repository?: AppDataReadRepository;
  search?: string;
  token?: string | null;
  verifier?: AuthTokenVerifier;
};

export async function requireProtectedPageAccess(
  input: ProtectedPageAccessInput,
): Promise<void> {
  if (await allowsE2eProtectedRouteBypass(input.e2eAuth)) {
    return;
  }

  const token = input.token === undefined
    ? await readAccessCookie()
    : input.token;

  if (!token) {
    redirect(signInRedirectFor(`${input.pathname}${input.search ?? ""}`));
  }

  const config = input.config ?? requireCognitoAuthConfig();
  const access = await evaluateProtectedRouteAccess({
    config,
    consentVersion: input.consentVersion ?? currentConsentVersion,
    now: input.now,
    pathname: input.pathname,
    repository: input.repository ?? createProtectedPageRepository(),
    search: input.search,
    token,
    verifier: input.verifier,
  });

  if (!access.ok) {
    throw new Error("Protected route access could not be evaluated");
  }

  if (access.value.decision === "redirect") {
    redirect(access.value.destination);
  }
}

async function readAccessCookie() {
  const cookieStore = await cookies();
  return cookieStore.get(patientAccessCookieName)?.value ?? null;
}

export async function allowsE2eProtectedRouteBypass(
  input: E2eProtectedRouteBypassInput = {},
) {
  const e2eAuthEnabled = input.env?.APOTH_E2E_AUTH_ENABLED
    ?? process.env.APOTH_E2E_AUTH_ENABLED;
  const e2eAuthNodeEnv = input.env?.NODE_ENV ?? process.env.NODE_ENV;
  const e2eAuthToken = (
    input.env?.APOTH_E2E_AUTH_TOKEN ?? process.env.APOTH_E2E_AUTH_TOKEN
  )?.trim();
  if (
    e2eAuthNodeEnv === "production" ||
    e2eAuthEnabled !== "1" ||
    !e2eAuthToken
  ) {
    return false;
  }

  const headerValue = input.headerValue === undefined
    ? (await headers()).get(e2eAuthHeaderName)
    : input.headerValue;

  return headerValue === e2eAuthToken;
}

function requireCognitoAuthConfig() {
  const config = resolveCognitoAuthConfig(process.env);
  if (!config.ok) {
    throw new Error("Cognito auth configuration is unavailable");
  }
  return config.value;
}

export function createProtectedPageRepository(
  env: Record<string, string | undefined> = process.env,
  options?: Parameters<typeof createDynamoDbAppDataReadRepository>[1],
): AppDataReadRepository {
  const config = resolveDynamoDbAppDataConfig(env);
  if (!config.ok) {
    throw new Error("DynamoDB app-data configuration is unavailable");
  }
  return createDynamoDbAppDataReadRepository(config.value, options);
}
