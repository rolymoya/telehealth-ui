import {
  getServerSession,
  isProtectedRoute,
  type AuthTokenVerifier,
  type CognitoAuthConfig,
} from "@/lib/auth";
import { evaluateBillingDisclosureGate } from "@/lib/billing-disclosure-gate";
import { requiredConsentsBeforeMdi } from "@/lib/consents";
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
    requiredConsents: requiredConsentsBeforeMdi(),
  });
  if (!snapshot.ok) {
    return snapshot;
  }

  const decision = decideProtectedRouteAccess({
    authenticated: true,
    pathname: input.pathname,
    search: input.search,
    snapshot: snapshot.value,
  });
  if (decision.decision !== "allow" || !requiresBillingDisclosureGate(input.pathname)) {
    return {
      ok: true,
      value: decision,
    };
  }

  const disclosureGate = await evaluateBillingDisclosureGate(input.repository, {
    cognitoSub: session.value.user.cognitoSub,
  });
  if (disclosureGate.status === "storage_unavailable") {
    return {
      ok: false,
      error: {
        kind: "validation_failed",
        message: "Billing disclosure gate is unavailable",
      },
    };
  }
  if (disclosureGate.status !== "ok") {
    return {
      ok: true,
      value: {
        decision: "redirect",
        destination: "/onboarding/consent?gate=medication",
        reason: "onboarding_step_required",
      },
    };
  }

  return {
    ok: true,
    value: decision,
  };
}

function requiresBillingDisclosureGate(pathname: string) {
  const path = pathname.trim().split(/[?#]/, 1)[0] || "/";
  return path === "/billing" ||
    path.startsWith("/billing/") ||
    path === "/dashboard" ||
    path.startsWith("/dashboard/") ||
    path === "/account" ||
    path.startsWith("/account/");
}
