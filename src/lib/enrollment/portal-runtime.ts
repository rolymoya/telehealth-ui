import {
  createSyntheticPortalProvider,
  type PortalProvider,
} from "@/lib/enrollment/portal-provider";

export type PortalRuntimeConfig = {
  launchEnabled: boolean;
  provisioningEnabled: boolean;
  provider: PortalProvider;
  returnOrigin: string;
};

export function resolvePortalRuntimeConfig(
  env: Record<string, string | undefined>,
): { ok: true; value: PortalRuntimeConfig } | { ok: false } {
  const providerCode = clean(env.APOTH_PORTAL_PROVIDER) ?? "synthetic";
  const stage = env.APOTH_STAGE === "production" ? "production" : "staging";
  const launchEnabled = env.APOTH_PORTAL_LAUNCH_ENABLED === "true";
  const provisioningEnabled = env.APOTH_PORTAL_PROVISIONING_ENABLED === "true";
  const launchOrigin = canonicalHttpsOrigin(env.APOTH_PORTAL_LAUNCH_ORIGIN);
  const returnOrigin = canonicalHttpsOrigin(
    env.APOTH_ACCOUNT_ORIGIN ?? env.NEXT_PUBLIC_SITE_URL,
  );

  if (
    providerCode !== "synthetic" ||
    !launchOrigin ||
    !returnOrigin ||
    (stage === "production" && (launchEnabled || provisioningEnabled))
  ) {
    return { ok: false };
  }

  return {
    ok: true,
    value: {
      launchEnabled,
      provisioningEnabled,
      provider: createSyntheticPortalProvider({ launchOrigin }),
      returnOrigin,
    },
  };
}

function canonicalHttpsOrigin(value: string | undefined) {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.username === "" &&
      url.password === ""
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

function clean(value: string | undefined) {
  const cleaned = value?.trim();
  return cleaned ? cleaned : undefined;
}
