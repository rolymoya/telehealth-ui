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

export function marketingHref(path: `/${string}`) {
  const configured = import.meta.env.VITE_MARKETING_ORIGIN?.trim();
  if (!configured) {
    return import.meta.env.DEV ? `http://127.0.0.1:3000${path}` : path;
  }
  try {
    const url = new URL(configured);
    const isLocalDevelopment = import.meta.env.DEV &&
      url.protocol === "http:" &&
      (url.hostname === "127.0.0.1" || url.hostname === "localhost");
    return (url.protocol === "https:" || isLocalDevelopment) &&
        url.username === "" &&
        url.password === ""
      ? new URL(path, `${url.origin}/`).toString()
      : path;
  } catch {
    return path;
  }
}

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
