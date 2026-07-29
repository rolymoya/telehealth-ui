import "server-only";

import type { StripeApiSecretPayload } from "@/lib/secrets/contracts";
import type { AppSigningSecretPayload } from "../../../shared/secrets/contracts";
import {
  resolveRuntimeStage,
  resolveStartupSecretSource,
  validateServerStartupSecrets,
} from "@/lib/secrets/startup";
import type { AppSigningSecret } from "../../../shared/intake/anonymous-precheck-context";
import type { IdentityFingerprintSecret } from "@/lib/enrollment/identity";

export async function resolveEnrollmentCheckoutSecrets(
  env: Record<string, string | undefined>,
): Promise<
  | {
    ok: true;
    value: {
      appSigning: AppSigningSecret;
      identityFingerprint?: IdentityFingerprintSecret;
      stripeApi: StripeApiSecretPayload;
    };
  }
  | { ok: false }
> {
  const source = resolveStartupSecretSource({
    env,
    requiredSecrets: ["appSigning", "stripeApi"],
  });
  if (!source.ok) {
    return { ok: false };
  }
  const validated = await validateServerStartupSecrets({
    requiredSecrets: ["appSigning", "stripeApi"],
    source: source.value.source,
    stage: resolveRuntimeStage(env),
  });
  if (!validated.ok) {
    return { ok: false };
  }

  const appSigning = validated.value.find((secret) => secret.secretKind === "appSigning");
  const stripeApi = validated.value.find((secret) => secret.secretKind === "stripeApi");
  if (!appSigning || appSigning.secretKind !== "appSigning" ||
      !stripeApi || stripeApi.secretKind !== "stripeApi") {
    return { ok: false };
  }

  return {
    ok: true,
    value: {
      appSigning: {
        signingSecret: appSigning.signingSecret,
        signingSecretPrevious: appSigning.signingSecretPrevious,
        signingSecretPreviousExpiresAt: appSigning.signingSecretPreviousExpiresAt,
      },
      identityFingerprint: identityFingerprintSecret(appSigning),
      stripeApi,
    },
  };
}

function identityFingerprintSecret(
  secret: AppSigningSecretPayload,
): IdentityFingerprintSecret | undefined {
  if (
    !secret.identityFingerprintSecret ||
    !Number.isInteger(secret.identityFingerprintKeyVersion) ||
    Number(secret.identityFingerprintKeyVersion) < 1
  ) {
    return undefined;
  }
  const previous = secret.identityFingerprintSecretPrevious &&
      Number.isInteger(secret.identityFingerprintKeyVersionPrevious) &&
      Number(secret.identityFingerprintKeyVersionPrevious) > 0 &&
      secret.identityFingerprintSecretPreviousExpiresAt
    ? {
      expiresAt: secret.identityFingerprintSecretPreviousExpiresAt,
      keyVersion: Number(secret.identityFingerprintKeyVersionPrevious),
      secret: secret.identityFingerprintSecretPrevious,
    }
    : undefined;
  return {
    current: {
      keyVersion: Number(secret.identityFingerprintKeyVersion),
      secret: secret.identityFingerprintSecret,
    },
    previous,
  };
}
