import type { CheckoutUiMode } from "@/lib/stripe";

export type EnrollmentStage = "production" | "staging";

export function resolveEnrollmentStage(
  env: Record<string, string | undefined>,
): EnrollmentStage {
  return env.APOTH_STAGE === "production" ? "production" : "staging";
}

export function resolveCheckoutUiMode(
  env: Record<string, string | undefined>,
): CheckoutUiMode | null {
  const stage = resolveEnrollmentStage(env);
  const configured = env.APOTH_CHECKOUT_UI_MODE?.trim();
  if (configured && configured !== "custom" && configured !== "hosted") {
    return null;
  }
  const mode: CheckoutUiMode = configured === "custom" ||
      configured === "hosted"
    ? configured
    : stage === "production" ? "hosted" : "custom";
  if (
    stage === "production" &&
    mode === "custom" &&
    env.APOTH_ALLOW_PRODUCTION_CUSTOM_CHECKOUT !== "true"
  ) {
    return null;
  }
  return mode;
}

export function resolveCheckoutIntegrationIdentifier(
  env: Record<string, string | undefined>,
) {
  const value = env.APOTH_STRIPE_INTEGRATION_IDENTIFIER?.trim() ??
    "apoth_enrollment_qjxmzvra";
  return /^[a-z0-9][a-z0-9_-]{7,99}$/.test(value) ? value : null;
}

export function enrollmentReturnUrlsForOrigin(origin: string) {
  return {
    cancelUrl: `${origin}/checkout?product=weight`,
    returnUrl: `${origin}/checkout/complete`,
    successUrl: `${origin}/checkout/complete`,
  };
}
