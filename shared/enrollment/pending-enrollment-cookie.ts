import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import type { AppSigningSecret } from "../intake/anonymous-precheck-context";

export const pendingEnrollmentCookieName = "__Host-apoth_enrollment_attempt";
export const pendingEnrollmentMaxAgeSeconds = 24 * 60 * 60;

export type PendingEnrollmentCookiePayload = {
  enrollmentId: string;
  expiresAt: string;
  issuedAt: string;
  purpose: "pending_enrollment";
  schemaVersion: 1;
};

export function enrollmentIdForInitialization(input: {
  initializationKey: string;
  secret: AppSigningSecret;
}) {
  if (!isInitializationKey(input.initializationKey)) {
    return null;
  }
  const digest = createHmac("sha256", input.secret.signingSecret)
    .update(`pending_enrollment:${input.initializationKey}`, "utf8")
    .digest("hex")
    .slice(0, 32);
  return `apoth_order_${digest}`;
}

export function createPendingEnrollmentCookie(input: {
  enrollmentId: string;
  now?: Date;
  secret: AppSigningSecret;
}) {
  if (!isEnrollmentId(input.enrollmentId)) {
    return null;
  }
  const now = input.now ?? new Date();
  const payload: PendingEnrollmentCookiePayload = {
    enrollmentId: input.enrollmentId,
    expiresAt: new Date(
      now.getTime() + pendingEnrollmentMaxAgeSeconds * 1000,
    ).toISOString(),
    issuedAt: now.toISOString(),
    purpose: "pending_enrollment",
    schemaVersion: 1,
  };
  const encoded = Buffer.from(canonicalJson(payload), "utf8").toString("base64url");
  return `${encoded}.${signatureFor(encoded, input.secret.signingSecret)}`;
}

export function verifyPendingEnrollmentCookie(input: {
  now?: Date;
  secret: AppSigningSecret;
  value?: string | null;
}):
  | { ok: true; payload: PendingEnrollmentCookiePayload }
  | { ok: false; reason: "expired" | "invalid" | "missing" } {
  if (!input.value) {
    return { ok: false, reason: "missing" };
  }
  const [encoded, signature, ...extra] = input.value.split(".");
  if (!encoded || !signature || extra.length > 0) {
    return { ok: false, reason: "invalid" };
  }
  const now = input.now ?? new Date();
  if (!hasValidSignature(encoded, signature, input.secret, now)) {
    return { ok: false, reason: "invalid" };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (!isPayload(payload)) {
    return { ok: false, reason: "invalid" };
  }

  const issuedAt = Date.parse(payload.issuedAt);
  const expiresAt = Date.parse(payload.expiresAt);
  if (
    !Number.isFinite(issuedAt) ||
    !Number.isFinite(expiresAt) ||
    issuedAt - now.getTime() > 60_000 ||
    expiresAt > issuedAt + pendingEnrollmentMaxAgeSeconds * 1000
  ) {
    return { ok: false, reason: "invalid" };
  }
  if (expiresAt <= now.getTime()) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, payload };
}

export function pendingEnrollmentSetCookieHeader(value: string) {
  return cookieHeader(value, pendingEnrollmentMaxAgeSeconds);
}

export function clearedPendingEnrollmentCookieHeader() {
  return cookieHeader("", 0);
}

function cookieHeader(value: string, maxAge: number) {
  return [
    `${pendingEnrollmentCookieName}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${maxAge}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ].join("; ");
}

function hasValidSignature(
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

function signatureFor(value: string, secret: string) {
  return createHmac("sha256", secret)
    .update(value, "utf8")
    .digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer);
}

function isPayload(value: unknown): value is PendingEnrollmentCookiePayload {
  return isRecord(value) &&
    value.purpose === "pending_enrollment" &&
    value.schemaVersion === 1 &&
    isEnrollmentId(value.enrollmentId) &&
    typeof value.issuedAt === "string" &&
    typeof value.expiresAt === "string";
}

function isEnrollmentId(value: unknown): value is string {
  return typeof value === "string" && /^apoth_order_[a-f0-9]{32}$/.test(value);
}

function isInitializationKey(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
