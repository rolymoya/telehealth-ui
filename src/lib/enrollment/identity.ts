import { createHmac } from "node:crypto";

export type IdentityFingerprintSecret = {
  current: {
    keyVersion: number;
    secret: string;
  };
  previous?: {
    expiresAt: string;
    keyVersion: number;
    secret: string;
  };
};

export function normalizeCheckoutEmail(value: string):
  | { ok: true; value: string }
  | { ok: false; code: "invalid_email" } {
  const normalized = value.trim().toLowerCase();
  if (
    normalized.length < 3 ||
    normalized.length > 320 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
  ) {
    return { ok: false, code: "invalid_email" };
  }
  return { ok: true, value: normalized };
}

export function emailFingerprintCandidates(input: {
  email: string;
  now?: Date;
  secret: IdentityFingerprintSecret;
}) {
  const normalized = normalizeCheckoutEmail(input.email);
  if (!normalized.ok) {
    return [];
  }
  const candidates = [fingerprint(normalized.value, input.secret.current)];
  if (
    input.secret.previous &&
    Date.parse(input.secret.previous.expiresAt) > (input.now ?? new Date()).getTime()
  ) {
    candidates.push(fingerprint(normalized.value, input.secret.previous));
  }
  return candidates;
}

export function cognitoUsernameForEmail(input: {
  email: string;
  secret: IdentityFingerprintSecret["current"];
}) {
  const normalized = normalizeCheckoutEmail(input.email);
  if (!normalized.ok) {
    return null;
  }
  return `apoth_${hmac(input.secret.secret, `cognito_username:${normalized.value}`)}`;
}

function fingerprint(
  email: string,
  secret: { keyVersion: number; secret: string },
) {
  return {
    fingerprint: `email_hmac_v${secret.keyVersion}_${hmac(secret.secret, `email_fingerprint:${email}`)}`,
    keyVersion: secret.keyVersion,
  };
}

function hmac(secret: string, value: string) {
  return createHmac("sha256", secret).update(value, "utf8").digest("hex");
}
