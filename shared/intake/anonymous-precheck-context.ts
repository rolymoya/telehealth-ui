import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import {
  isLaunchTreatment,
  requiredConsentsForPrecheck,
} from "../consents";
import { isUsStateCode } from "./us-states";

export const anonymousPrecheckContextCookieName =
  "__Host-apoth_anonymous_precheck";
export const privacyNoticeGateCookieName = "__Host-apoth_privacy_notice";
export const anonymousPrecheckContextMaxAgeSeconds = 30 * 60;
export const privacyNoticeGateMaxAgeSeconds = 30 * 60;

export type AppSigningSecret = {
  signingSecret: string;
  signingSecretPrevious?: string;
  signingSecretPreviousExpiresAt?: string;
};

export type PrivacyNoticeGatePayload = {
  expiresAt: string;
  issuedAt: string;
  nonce: string;
  privacyNoticeVersion: string;
  purpose: "privacy_notice_gate";
  schemaVersion: 1;
};

export type AnonymousPrecheckContextPayload = {
  expiresAt: string;
  issuedAt: string;
  nonce: string;
  outcome: "eligible_for_intake";
  privacyNoticeVersion: string;
  purpose: "anonymous_precheck";
  residencyState: string;
  schemaVersion: 1;
  selectedTreatment: string;
};

type VerifyOptions = {
  currentPrivacyNoticeVersion?: string;
  maxAgeSeconds?: number;
  now?: Date;
};

export function currentPrivacyNoticeVersion() {
  const privacyNotice = requiredConsentsForPrecheck().find((consent) =>
    consent.consentKind === "privacy_notice"
  );
  return privacyNotice?.version ?? "";
}

export function createPrivacyNoticeGateContext(input: {
  now?: Date;
  nonce?: string;
  secret: AppSigningSecret;
}) {
  const now = input.now ?? new Date();
  const payload: PrivacyNoticeGatePayload = {
    expiresAt: isoAfter(now, privacyNoticeGateMaxAgeSeconds),
    issuedAt: now.toISOString(),
    nonce: input.nonce ?? randomNonce(),
    privacyNoticeVersion: currentPrivacyNoticeVersion(),
    purpose: "privacy_notice_gate",
    schemaVersion: 1,
  };
  return signPayload(payload, input.secret.signingSecret);
}

export function createAnonymousPrecheckContext(input: {
  now?: Date;
  nonce?: string;
  privacyNoticeVersion?: string;
  residencyState: string;
  secret: AppSigningSecret;
  selectedTreatment: string;
}) {
  const now = input.now ?? new Date();
  const payload: AnonymousPrecheckContextPayload = {
    expiresAt: isoAfter(now, anonymousPrecheckContextMaxAgeSeconds),
    issuedAt: now.toISOString(),
    nonce: input.nonce ?? randomNonce(),
    outcome: "eligible_for_intake",
    privacyNoticeVersion: input.privacyNoticeVersion ?? currentPrivacyNoticeVersion(),
    purpose: "anonymous_precheck",
    residencyState: input.residencyState,
    schemaVersion: 1,
    selectedTreatment: input.selectedTreatment,
  };
  return signPayload(payload, input.secret.signingSecret);
}

export function verifyPrivacyNoticeGateContext(input: {
  secret: AppSigningSecret;
  value?: string | null;
} & VerifyOptions):
  | { ok: true; payload: PrivacyNoticeGatePayload }
  | { ok: false; reason: "missing" | "invalid" | "expired" } {
  const parsed = verifySignedPayload(input.value, input.secret, input.now);
  if (!parsed.ok) {
    return parsed;
  }
  if (!isPrivacyNoticeGatePayload(parsed.payload)) {
    return { ok: false, reason: "invalid" };
  }
  const validity = validateTemporalPayload(parsed.payload, {
    currentPrivacyNoticeVersion: input.currentPrivacyNoticeVersion,
    maxAgeSeconds: input.maxAgeSeconds ?? privacyNoticeGateMaxAgeSeconds,
    now: input.now,
  });
  if (!validity.ok) {
    return validity;
  }
  return { ok: true, payload: parsed.payload };
}

export function verifyAnonymousPrecheckContext(input: {
  secret: AppSigningSecret;
  value?: string | null;
} & VerifyOptions):
  | { ok: true; payload: AnonymousPrecheckContextPayload }
  | { ok: false; reason: "missing" | "invalid" | "expired" } {
  const parsed = verifySignedPayload(input.value, input.secret, input.now);
  if (!parsed.ok) {
    return parsed;
  }
  if (!isAnonymousPrecheckContextPayload(parsed.payload)) {
    return { ok: false, reason: "invalid" };
  }
  const validity = validateTemporalPayload(parsed.payload, {
    currentPrivacyNoticeVersion: input.currentPrivacyNoticeVersion,
    maxAgeSeconds: input.maxAgeSeconds ?? anonymousPrecheckContextMaxAgeSeconds,
    now: input.now,
  });
  if (!validity.ok) {
    return validity;
  }
  return { ok: true, payload: parsed.payload };
}

export function privacyNoticeGateSetCookieHeader(value: string) {
  return setCookieHeader({
    maxAge: privacyNoticeGateMaxAgeSeconds,
    name: privacyNoticeGateCookieName,
    value,
  });
}

export function anonymousPrecheckContextSetCookieHeader(value: string) {
  return setCookieHeader({
    maxAge: anonymousPrecheckContextMaxAgeSeconds,
    name: anonymousPrecheckContextCookieName,
    value,
  });
}

export function clearedAnonymousPrecheckContextCookieHeader() {
  return setCookieHeader({
    maxAge: 0,
    name: anonymousPrecheckContextCookieName,
    value: "",
  });
}

function signPayload(payload: Record<string, unknown>, secret: string) {
  const encoded = Buffer.from(canonicalJson(payload), "utf8").toString("base64url");
  return `${encoded}.${signatureFor(encoded, secret)}`;
}

function verifySignedPayload(
  value: string | null | undefined,
  secret: AppSigningSecret,
  now = new Date(),
):
  | { ok: true; payload: unknown }
  | { ok: false; reason: "missing" | "invalid" | "expired" } {
  if (!value) {
    return { ok: false, reason: "missing" };
  }
  const [encoded, signature, ...extra] = value.split(".");
  if (!encoded || !signature || extra.length > 0) {
    return { ok: false, reason: "invalid" };
  }
  if (!validSignature(encoded, signature, secret, now)) {
    return { ok: false, reason: "invalid" };
  }
  try {
    const decoded = Buffer.from(encoded, "base64url").toString("utf8");
    return { ok: true, payload: JSON.parse(decoded) };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}

function validSignature(
  encoded: string,
  signature: string,
  secret: AppSigningSecret,
  now: Date,
) {
  if (timingSafeStringEqual(signature, signatureFor(encoded, secret.signingSecret))) {
    return true;
  }
  if (
    secret.signingSecretPrevious &&
    secret.signingSecretPreviousExpiresAt &&
    Date.parse(secret.signingSecretPreviousExpiresAt) >= now.getTime()
  ) {
    return timingSafeStringEqual(
      signature,
      signatureFor(encoded, secret.signingSecretPrevious),
    );
  }
  return false;
}

function validateTemporalPayload(
  payload: PrivacyNoticeGatePayload | AnonymousPrecheckContextPayload,
  options: Required<Pick<VerifyOptions, "maxAgeSeconds">> & Omit<VerifyOptions, "maxAgeSeconds">,
): { ok: true } | { ok: false; reason: "invalid" | "expired" } {
  const now = options.now ?? new Date();
  const issuedAt = Date.parse(payload.issuedAt);
  const expiresAt = Date.parse(payload.expiresAt);
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) {
    return { ok: false, reason: "invalid" };
  }
  if (issuedAt - now.getTime() > 60_000) {
    return { ok: false, reason: "invalid" };
  }
  if (expiresAt > issuedAt + options.maxAgeSeconds * 1000) {
    return { ok: false, reason: "invalid" };
  }
  if (expiresAt <= now.getTime()) {
    return { ok: false, reason: "expired" };
  }
  const currentVersion = options.currentPrivacyNoticeVersion ??
    currentPrivacyNoticeVersion();
  if (!currentVersion || payload.privacyNoticeVersion !== currentVersion) {
    return { ok: false, reason: "invalid" };
  }
  return { ok: true };
}

function isPrivacyNoticeGatePayload(value: unknown): value is PrivacyNoticeGatePayload {
  return isRecord(value) &&
    value.purpose === "privacy_notice_gate" &&
    value.schemaVersion === 1 &&
    typeof value.issuedAt === "string" &&
    typeof value.expiresAt === "string" &&
    typeof value.nonce === "string" &&
    typeof value.privacyNoticeVersion === "string";
}

function isAnonymousPrecheckContextPayload(
  value: unknown,
): value is AnonymousPrecheckContextPayload {
  return isRecord(value) &&
    value.purpose === "anonymous_precheck" &&
    value.schemaVersion === 1 &&
    value.outcome === "eligible_for_intake" &&
    typeof value.issuedAt === "string" &&
    typeof value.expiresAt === "string" &&
    typeof value.nonce === "string" &&
    typeof value.privacyNoticeVersion === "string" &&
    typeof value.residencyState === "string" &&
    isUsStateCode(value.residencyState) &&
    typeof value.selectedTreatment === "string" &&
    isLaunchTreatment(value.selectedTreatment);
}

function setCookieHeader(input: {
  maxAge: number;
  name: string;
  value: string;
}) {
  return [
    `${input.name}=${encodeURIComponent(input.value)}`,
    "Path=/",
    `Max-Age=${Math.max(0, Math.floor(input.maxAge))}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ].join("; ");
}

function signatureFor(encoded: string, secret: string) {
  return createHmac("sha256", secret)
    .update(encoded, "utf8")
    .digest("base64url");
}

function timingSafeStringEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function isoAfter(now: Date, seconds: number) {
  return new Date(now.getTime() + seconds * 1000).toISOString();
}

function randomNonce() {
  return randomBytes(16).toString("base64url");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
