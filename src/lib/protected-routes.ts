import {
  getServerSession,
  isProtectedRoute,
  type AuthTokenVerifier,
  type CognitoAuthConfig,
} from "@/lib/auth";
import type {
  AppDataResult,
} from "@/lib/dynamodb/app-data";
import {
  decideProtectedRouteAccess,
  type RouteGateDecision,
} from "@/lib/onboarding-gates";
import {
  readOnboardingGateSnapshotAsync,
  type AppDataReadRepository,
} from "@/lib/onboarding-status";

export async function evaluateProtectedRouteAccess(input: {
  config: CognitoAuthConfig;
  consentVersion: string;
  now?: Date;
  pathname: string;
  repository: AppDataReadRepository;
  search?: string;
  token?: string | null;
  verifier?: AuthTokenVerifier;
}): Promise<AppDataResult<RouteGateDecision>> {
  if (!isProtectedRoute(input.pathname)) {
    return { ok: true, value: { decision: "allow" } };
  }

  const session = await getServerSession({
    config: input.config,
    now: input.now,
    token: input.token,
    verifier: input.verifier,
  });
  if (!session.ok) {
    return {
      ok: true,
      value: decideProtectedRouteAccess({
        authenticated: false,
        pathname: input.pathname,
        search: input.search,
      }),
    };
  }

  const snapshot = await readOnboardingGateSnapshotAsync(input.repository, {
    cognitoSub: session.value.user.cognitoSub,
    consentVersion: input.consentVersion,
  });
  if (!snapshot.ok) {
    return snapshot;
  }

  return {
    ok: true,
    value: decideProtectedRouteAccess({
      authenticated: true,
      pathname: input.pathname,
      search: input.search,
      snapshot: snapshot.value,
    }),
  };
}
