import "server-only";

import {
  resolveRuntimeStage,
  resolveStartupSecretSource,
  validateServerStartupSecrets,
} from "@/lib/secrets/startup";
import type { AppSigningSecret } from "../../shared/intake/anonymous-precheck-context";

export async function resolveAppSigningSecret(
  env: Record<string, string | undefined> = process.env,
): Promise<
  | { ok: true; value: AppSigningSecret }
  | { ok: false }
> {
  const source = resolveStartupSecretSource({
    env,
    requiredSecrets: ["appSigning"],
  });
  if (!source.ok) {
    return { ok: false };
  }
  const validated = await validateServerStartupSecrets({
    stage: resolveRuntimeStage(env),
    requiredSecrets: ["appSigning"],
    source: source.value.source,
  });
  if (!validated.ok) {
    return { ok: false };
  }
  const secret = validated.value.find((value) =>
    value.secretKind === "appSigning"
  );
  if (!secret || secret.secretKind !== "appSigning") {
    return { ok: false };
  }
  return {
    ok: true,
    value: {
      signingSecret: secret.signingSecret,
      signingSecretPrevious: secret.signingSecretPrevious,
      signingSecretPreviousExpiresAt: secret.signingSecretPreviousExpiresAt,
    },
  };
}
