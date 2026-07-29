import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import type { AppSigningSecret } from "../../../shared/intake/anonymous-precheck-context";

export const otpChallengeCookieName = "__Host-apoth_otp_challenge";
export const otpChallengeMaxAgeSeconds = 10 * 60;

type OtpChallengePayload = {
  cognitoSession: string;
  cognitoUsername: string;
  expiresAt: string;
  issuedAt: string;
  purpose: "cognito_email_otp";
  schemaVersion: 1;
  transactionHandle: string;
};

export function createOtpChallengeCookie(input: {
  cognitoSession: string;
  cognitoUsername: string;
  iv?: Buffer;
  now?: Date;
  secret: AppSigningSecret;
  transactionHandle: string;
}) {
  const now = input.now ?? new Date();
  const payload: OtpChallengePayload = {
    cognitoSession: input.cognitoSession,
    cognitoUsername: input.cognitoUsername,
    expiresAt: new Date(now.getTime() + otpChallengeMaxAgeSeconds * 1000).toISOString(),
    issuedAt: now.toISOString(),
    purpose: "cognito_email_otp",
    schemaVersion: 1,
    transactionHandle: input.transactionHandle,
  };
  const iv = input.iv ?? randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(input.secret.signingSecret), iv);
  cipher.setAAD(Buffer.from("apoth:cognito-email-otp:v1", "utf8"));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    encrypted.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
  ].join(".");
}

export function verifyOtpChallengeCookie(input: {
  now?: Date;
  secret: AppSigningSecret;
  value?: string | null;
}):
  | { ok: true; payload: OtpChallengePayload }
  | { ok: false; reason: "missing" | "invalid" | "expired" } {
  if (!input.value) {
    return { ok: false, reason: "missing" };
  }
  const [version, ivValue, encryptedValue, tagValue, ...extra] = input.value.split(".");
  if (version !== "v1" || !ivValue || !encryptedValue || !tagValue || extra.length > 0) {
    return { ok: false, reason: "invalid" };
  }

  const now = input.now ?? new Date();
  const secrets = [input.secret.signingSecret];
  if (
    input.secret.signingSecretPrevious &&
    input.secret.signingSecretPreviousExpiresAt &&
    Date.parse(input.secret.signingSecretPreviousExpiresAt) >= now.getTime()
  ) {
    secrets.push(input.secret.signingSecretPrevious);
  }

  for (const secret of secrets) {
    const payload = decrypt({
      encryptedValue,
      ivValue,
      secret,
      tagValue,
    });
    if (!payload) {
      continue;
    }
    const temporal = validateTemporal(payload, now);
    return temporal === "ok"
      ? { ok: true, payload }
      : { ok: false, reason: temporal };
  }
  return { ok: false, reason: "invalid" };
}

export function otpTransactionDigest(handle: string) {
  return `otp_digest_${createHash("sha256")
    .update(`cognito_email_otp:${handle}`, "utf8")
    .digest("hex")}`;
}

export function otpChallengeCorrelationHash(session: string) {
  return `challenge_hash_${createHash("sha256")
    .update(`cognito_challenge:${session}`, "utf8")
    .digest("hex")}`;
}

export function otpChallengeCookieHeader(value: string) {
  return [
    `${otpChallengeCookieName}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${otpChallengeMaxAgeSeconds}`,
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
  ].join("; ");
}

export function clearedOtpChallengeCookieHeader() {
  return [
    `${otpChallengeCookieName}=`,
    "Path=/",
    "Max-Age=0",
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
  ].join("; ");
}

function decrypt(input: {
  encryptedValue: string;
  ivValue: string;
  secret: string;
  tagValue: string;
}) {
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(input.secret),
      Buffer.from(input.ivValue, "base64url"),
    );
    decipher.setAAD(Buffer.from("apoth:cognito-email-otp:v1", "utf8"));
    decipher.setAuthTag(Buffer.from(input.tagValue, "base64url"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(input.encryptedValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    const parsed: unknown = JSON.parse(decrypted);
    return isPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function validateTemporal(payload: OtpChallengePayload, now: Date) {
  const issuedAt = Date.parse(payload.issuedAt);
  const expiresAt = Date.parse(payload.expiresAt);
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) ||
      issuedAt - now.getTime() > 60_000 ||
      expiresAt > issuedAt + otpChallengeMaxAgeSeconds * 1000) {
    return "invalid" as const;
  }
  return expiresAt <= now.getTime() ? "expired" as const : "ok" as const;
}

function isPayload(value: unknown): value is OtpChallengePayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const payload = value as Record<string, unknown>;
  return Object.keys(payload).length === 7 &&
    payload.schemaVersion === 1 &&
    payload.purpose === "cognito_email_otp" &&
    typeof payload.cognitoSession === "string" && payload.cognitoSession.length >= 20 &&
    typeof payload.cognitoUsername === "string" && payload.cognitoUsername.length >= 3 &&
    typeof payload.transactionHandle === "string" && payload.transactionHandle.length >= 16 &&
    typeof payload.issuedAt === "string" &&
    typeof payload.expiresAt === "string";
}

function encryptionKey(signingSecret: string) {
  return createHash("sha256")
    .update(`otp_challenge_encryption:${signingSecret}`, "utf8")
    .digest();
}
