export type OnboardingStep = "consent" | "intake" | "mdi" | "billing" | "complete";

type GateOnboardingStatus =
  | "profile_pending"
  | "intake_ready"
  | "mdi_submitted"
  | "clinical_review"
  | "billing_ready";

type GateBillingStatus =
  | "not_started"
  | "payment_method_pending"
  | "payment_method_collected"
  | "active"
  | "past_due"
  | "canceled";

export type OnboardingGateSnapshot = {
  billingStatus?: GateBillingStatus;
  consentAccepted: boolean;
  mdiCaseId?: string;
  mdiPatientId?: string;
  onboardingStatus?: GateOnboardingStatus;
  residencyState?: string;
};

export type RouteGateDecision =
  | { decision: "allow" }
  | {
      decision: "redirect";
      destination: string;
      reason: "authentication_required" | "onboarding_step_required";
    };

export const onboardingStepOrder = [
  "consent",
  "intake",
  "mdi",
  "billing",
  "complete",
] as const satisfies readonly OnboardingStep[];

const stepRoutes = {
  consent: "/onboarding/consent",
  intake: "/intake",
  mdi: "/onboarding/mdi",
  billing: "/billing",
  complete: "/dashboard",
} as const satisfies Record<OnboardingStep, string>;

export function onboardingRouteForStep(step: OnboardingStep) {
  return stepRoutes[step];
}

export function decideProtectedRouteAccess(input: {
  authenticated: boolean;
  pathname: string;
  search?: string;
  snapshot?: OnboardingGateSnapshot | null;
}): RouteGateDecision {
  if (!input.authenticated) {
    return {
      decision: "redirect",
      reason: "authentication_required",
      destination: signInRedirectFor(`${input.pathname}${input.search ?? ""}`),
    };
  }

  const currentStep = stepForPath(input.pathname);
  if (!currentStep) {
    return { decision: "allow" };
  }

  const requiredStep = earliestIncompleteOnboardingStep(input.snapshot ?? null);
  if (stepIndex(currentStep) > stepIndex(requiredStep)) {
    return {
      decision: "redirect",
      reason: "onboarding_step_required",
      destination: stepRoutes[requiredStep],
    };
  }

  return { decision: "allow" };
}

export function earliestIncompleteOnboardingStep(
  snapshot: OnboardingGateSnapshot | null,
): OnboardingStep {
  if (!snapshot?.consentAccepted) {
    return "consent";
  }

  if (
    !snapshot.onboardingStatus ||
    snapshot.onboardingStatus === "profile_pending" ||
    (snapshot.onboardingStatus === "intake_ready" && !snapshot.residencyState)
  ) {
    return "intake";
  }

  if (
    snapshot.onboardingStatus === "mdi_submitted" ||
    snapshot.onboardingStatus !== "billing_ready" ||
    !snapshot.mdiPatientId ||
    !snapshot.mdiCaseId
  ) {
    return "mdi";
  }

  if (!isBillingComplete(snapshot.billingStatus)) {
    return "billing";
  }

  return "complete";
}

export function signInRedirectFor(returnTo: string) {
  const sanitized = sanitizeReturnToPath(returnTo);
  return sanitized ? `/sign-in?returnTo=${encodeURIComponent(sanitized)}` : "/sign-in";
}

export function sanitizeReturnToPath(returnTo: string | null | undefined) {
  if (!returnTo) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(returnTo, "https://apoth.local");
  } catch {
    return null;
  }

  if (parsed.origin !== "https://apoth.local") {
    return null;
  }

  const path = `${parsed.pathname}${parsed.search}`;
  if (!path.startsWith("/") || path.startsWith("//")) {
    return null;
  }
  if (isAuthRoute(path)) {
    return null;
  }

  return path;
}

function stepForPath(pathname: string): OnboardingStep | null {
  const path = normalizePath(pathname);
  if (path === "/onboarding/consent" || path.startsWith("/onboarding/consent/")) {
    return "consent";
  }
  if (path === "/intake" || path.startsWith("/intake/")) {
    return "intake";
  }
  if (path === "/onboarding/mdi" || path.startsWith("/onboarding/mdi/")) {
    return "mdi";
  }
  if (path === "/billing" || path.startsWith("/billing/")) {
    return "billing";
  }
  if (
    path === "/account" ||
    path.startsWith("/account/") ||
    path === "/dashboard" ||
    path.startsWith("/dashboard/")
  ) {
    return "complete";
  }
  return null;
}

function normalizePath(pathname: string) {
  const path = pathname.trim().split(/[?#]/, 1)[0] || "/";
  return path.startsWith("/") ? path : `/${path}`;
}

function stepIndex(step: OnboardingStep) {
  return onboardingStepOrder.indexOf(step);
}

function isBillingComplete(status: GateBillingStatus | undefined) {
  return status === "payment_method_collected" || status === "active";
}

function isAuthRoute(path: string) {
  return /^\/(?:sign-in|sign-up|sign-out|verify-email|reset-password)(?:\/|$|\?)/.test(path);
}
