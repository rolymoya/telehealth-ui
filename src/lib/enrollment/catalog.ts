import type {
  EnrollmentCatalog,
  EnrollmentCatalogEntry,
} from "@/lib/enrollment/checkout-service";

export type EnrollmentCheckoutRuntimeConfig = {
  catalog: EnrollmentCatalog;
  enabled: boolean;
  integrationIdentifier: string;
  marketingOrigin: string;
  stage: "staging" | "production";
  successOrigin: string;
};

export function resolveEnrollmentCheckoutRuntimeConfig(
  env: Record<string, string | undefined>,
):
  | { ok: true; value: EnrollmentCheckoutRuntimeConfig }
  | { ok: false } {
  const stage = env.APOTH_STAGE === "production" ? "production" : "staging";
  const marketingOrigin = canonicalCheckoutOrigin(
    env.APOTH_MARKETING_ORIGIN ?? env.NEXT_PUBLIC_SITE_URL,
    stage,
  );
  const successOrigin = canonicalCheckoutOrigin(
    env.APOTH_ACCOUNT_ORIGIN ?? env.NEXT_PUBLIC_SITE_URL,
    stage,
  );
  const integrationIdentifier = clean(env.APOTH_STRIPE_INTEGRATION_IDENTIFIER);
  const weightCatalogId = clean(env.APOTH_CHECKOUT_CATALOG_WEIGHT_ID);
  if (
    !marketingOrigin ||
    !successOrigin ||
    !integrationIdentifier ||
    !weightCatalogId ||
    !/^catalog_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*$/.test(weightCatalogId)
  ) {
    return { ok: false };
  }

  const entries = new Map<string, EnrollmentCatalogEntry>([
    ["weight", {
      cancelPath: "/weight-loss",
      internalCatalogCode: weightCatalogId,
    }],
  ]);
  addOptionalCatalog(entries, "hair", "/#services", env.APOTH_CHECKOUT_CATALOG_HAIR_ID);
  addOptionalCatalog(
    entries,
    "sexual-health",
    "/#services",
    env.APOTH_CHECKOUT_CATALOG_SEXUAL_HEALTH_ID,
  );

  return {
    ok: true,
    value: {
      catalog: {
        resolve: (publicCode) => entries.get(publicCode) ?? null,
      },
      enabled: env.APOTH_CHECKOUT_SIGNUP_ENABLED === "true",
      integrationIdentifier,
      marketingOrigin,
      stage,
      successOrigin,
    },
  };
}

function addOptionalCatalog(
  entries: Map<string, EnrollmentCatalogEntry>,
  publicCode: string,
  cancelPath: `/${string}`,
  configuredId: string | undefined,
) {
  const internalCatalogCode = clean(configuredId);
  if (internalCatalogCode && /^catalog_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*$/.test(internalCatalogCode)) {
    entries.set(publicCode, { cancelPath, internalCatalogCode });
  }
}

function canonicalCheckoutOrigin(
  value: string | undefined,
  stage: "staging" | "production",
) {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    const secure = url.protocol === "https:";
    const localStaging = stage === "staging" &&
      url.protocol === "http:" &&
      (url.hostname === "127.0.0.1" || url.hostname === "localhost");
    return (secure || localStaging) &&
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
