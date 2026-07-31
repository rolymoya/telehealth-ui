import {
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import type { AppSigningSecret } from "../../../shared/intake/anonymous-precheck-context";

export const enrollmentAttemptCookieName = "__Host-apoth_enrollment";
export const enrollmentAttemptMaxAgeSeconds = 60 * 60;

export type EnrollmentAttemptCookiePayload = {
  attemptSecret: string;
  enrollmentId: string;
  expiresAt: string;
  issuedAt: string;
  purpose: "checkout_enrollment";
  schemaVersion: 1;
};

export function createEnrollmentAttemptCookie(input: {
  attemptSecret: string;
  enrollmentId: string;
  now?: Date;
  secret: AppSigningSecret;
}) {
  const now = input.now ?? new Date();
  const payload: EnrollmentAttemptCookiePayload = {
    attemptSecret: input.attemptSecret,
    enrollmentId: input.enrollmentId,
    expiresAt: new Date(
      now.getTime() + enrollmentAttemptMaxAgeSeconds * 1000,
    ).toISOString(),
    issuedAt: now.toISOString(),
    purpose: "checkout_enrollment",
    schemaVersion: 1,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${signatureFor(encoded, input.secret.signingSecret)}`;
}

export function verifyEnrollmentAttemptCookie(input: {
  now?: Date;
  secret: AppSigningSecret;
  value?: string | null;
}):
  | { ok: true; payload: EnrollmentAttemptCookiePayload }
  | { ok: false; reason: "missing" | "invalid" | "expired" } {
  if (!input.value) {
    return { ok: false, reason: "missing" };
  }
  const [encoded, signature, ...extra] = input.value.split(".");
  if (!encoded || !signature || extra.length > 0) {
    return { ok: false, reason: "invalid" };
  }
  const now = input.now ?? new Date();
  if (!validSignature(encoded, signature, input.secret, now)) {
    return { ok: false, reason: "invalid" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (!isEnrollmentAttemptPayload(parsed)) {
    return { ok: false, reason: "invalid" };
  }

  const issuedAt = Date.parse(parsed.issuedAt);
  const expiresAt = Date.parse(parsed.expiresAt);
  if (
    !Number.isFinite(issuedAt) ||
    !Number.isFinite(expiresAt) ||
    issuedAt - now.getTime() > 60_000 ||
    expiresAt > issuedAt + enrollmentAttemptMaxAgeSeconds * 1000
  ) {
    return { ok: false, reason: "invalid" };
  }
  if (expiresAt <= now.getTime()) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, payload: parsed };
}

export function enrollmentAttemptBindingHash(attemptSecret: string) {
  return `sha256:${createHash("sha256")
    .update(`checkout_enrollment:${attemptSecret}`, "utf8")
    .digest("hex")}`;
}

export function enrollmentAttemptMatchesBinding(
  attemptSecret: string,
  storedBindingHash: string,
) {
  return safeEqual(
    enrollmentAttemptBindingHash(attemptSecret),
    storedBindingHash,
  );
}

export function enrollmentAttemptCookieHeader(value: string) {
  return [
    `${enrollmentAttemptCookieName}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${enrollmentAttemptMaxAgeSeconds}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ].join("; ");
}

function validSignature(
  encoded: string,
  signature: string,
  secret: AppSigningSecret,
  now: Date,
) {
  if (safeEqual(signature, signatureFor(encoded, secret.signingSecret))) {
    return true;
  }
  return Boolean(
    secret.signingSecretPrevious &&
    secret.signingSecretPreviousExpiresAt &&
    Date.parse(secret.signingSecretPreviousExpiresAt) >= now.getTime() &&
    safeEqual(signature, signatureFor(encoded, secret.signingSecretPrevious)),
  );
}

function signatureFor(encoded: string, secret: string) {
  return createHmac("sha256", secret).update(encoded, "utf8").digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer);
}

function isEnrollmentAttemptPayload(value: unknown): value is EnrollmentAttemptCookiePayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const payload = value as Record<string, unknown>;
  return Object.keys(payload).length === 6 &&
    payload.schemaVersion === 1 &&
    payload.purpose === "checkout_enrollment" &&
    typeof payload.attemptSecret === "string" && payload.attemptSecret.length >= 16 &&
    typeof payload.enrollmentId === "string" && payload.enrollmentId.startsWith("apoth_order_") &&
    typeof payload.issuedAt === "string" &&
    typeof payload.expiresAt === "string";
}
