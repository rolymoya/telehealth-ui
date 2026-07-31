export type PublicPatientConfig = {
  cognitoRegion: string;
  userPoolClientId: string;
  userPoolId: string;
};

export type PublicStripeConfig =
  | {
      ok: true;
      publishableKey: string;
      stage: "production" | "staging";
    }
  | {
      ok: false;
      reason: "missing" | "stage_mismatch";
    };

export function publicPatientConfig(): PublicPatientConfig {
  return {
    cognitoRegion: import.meta.env.VITE_COGNITO_REGION ?? "",
    userPoolClientId: import.meta.env.VITE_COGNITO_USER_POOL_CLIENT_ID ?? "",
    userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID ?? "",
  };
}

export function publicStripeConfig(): PublicStripeConfig {
  const stage = import.meta.env.VITE_APOTH_STAGE === "production"
    ? "production" as const
    : "staging" as const;
  const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY?.trim() ?? "";
  if (!publishableKey) {
    return { ok: false, reason: "missing" };
  }
  if (
    (stage === "staging" && !publishableKey.startsWith("pk_test_")) ||
    (stage === "production" && !publishableKey.startsWith("pk_live_"))
  ) {
    return { ok: false, reason: "stage_mismatch" };
  }
  return { ok: true, publishableKey, stage };
}
