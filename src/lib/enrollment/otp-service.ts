import "server-only";

import { randomBytes } from "node:crypto";
import type { AppSigningSecret } from "../../../shared/intake/anonymous-precheck-context";
import {
  enrollmentAttemptMatchesBinding,
  verifyEnrollmentAttemptCookie,
} from "@/lib/enrollment/attempt-cookie";
import {
  cognitoUsernameForEmail,
  emailFingerprintCandidates,
  normalizeCheckoutEmail,
  type IdentityFingerprintSecret,
} from "@/lib/enrollment/identity";
import {
  createOtpChallengeCookie,
  otpChallengeCorrelationHash,
  otpChallengeMaxAgeSeconds,
  otpTransactionDigest,
} from "@/lib/enrollment/otp-challenge-cookie";
import { createOtpTransactionRecord } from "@/lib/enrollment/records";
import type { EnrollmentRepository } from "@/lib/enrollment/repository";

export type EnrollmentOtpCognito = {
  ensurePasswordlessUser(input: {
    email: string;
    preferredUsername: string;
  }): Promise<
    | { ok: true; username: string }
    | { ok: false; code: string }
  >;
  startEmailOtp(input: { username: string }): Promise<
    | { ok: true; challengeName: "EMAIL_OTP"; session: string }
    | { ok: false; code: string }
  >;
};

export async function startEnrollmentEmailOtp(input: {
  attemptCookie?: string | null;
  cognito: EnrollmentOtpCognito;
  identitySecret: IdentityFingerprintSecret;
  ids?: { transactionHandle(): string };
  now?: Date;
  repository: EnrollmentRepository;
  signingSecret: AppSigningSecret;
  stripe: {
    customers: {
      retrieve(customerId: string): Promise<unknown>;
    };
  };
}): Promise<
  | {
    ok: true;
    status: "verification_code_sent";
    transactionHandle: string;
    challengeCookie: string;
  }
  | {
    ok: false;
    code: "verification_not_ready" | "verification_unavailable";
  }
> {
  const now = input.now ?? new Date();
  const attempt = verifyEnrollmentAttemptCookie({
    now,
    secret: input.signingSecret,
    value: input.attemptCookie,
  });
  if (!attempt.ok) {
    return { ok: false, code: "verification_not_ready" };
  }
  const enrollmentResult = await input.repository.getEnrollment(
    attempt.payload.enrollmentId,
  );
  if (!enrollmentResult.ok) {
    return { ok: false, code: "verification_unavailable" };
  }
  const enrollment = enrollmentResult.value;
  if (
    !enrollment ||
    !enrollmentAttemptMatchesBinding(
      attempt.payload.attemptSecret,
      enrollment.attemptBindingHash,
    ) ||
    enrollment.checkout !== "completed" ||
    enrollment.paymentSetup !== "setup_succeeded" ||
    !enrollment.stripeCustomerId ||
    !enrollment.stripeCheckoutSessionId
  ) {
    return { ok: false, code: "verification_not_ready" };
  }

  let stripeCustomer: unknown;
  try {
    stripeCustomer = await input.stripe.customers.retrieve(
      enrollment.stripeCustomerId,
    );
  } catch {
    return { ok: false, code: "verification_unavailable" };
  }
  const emailValue = isRecord(stripeCustomer) && stripeCustomer.deleted !== true &&
      typeof stripeCustomer.email === "string"
    ? stripeCustomer.email
    : "";
  const normalizedEmail = normalizeCheckoutEmail(emailValue);
  const fingerprints = normalizedEmail.ok
    ? emailFingerprintCandidates({
      email: normalizedEmail.value,
      now,
      secret: input.identitySecret,
    })
    : [];
  const preferredUsername = normalizedEmail.ok
    ? cognitoUsernameForEmail({
      email: normalizedEmail.value,
      secret: input.identitySecret.current,
    })
    : null;
  if (!normalizedEmail.ok || !fingerprints[0] || !preferredUsername) {
    return { ok: false, code: "verification_unavailable" };
  }

  const user = await input.cognito.ensurePasswordlessUser({
    email: normalizedEmail.value,
    preferredUsername,
  });
  if (!user.ok) {
    return { ok: false, code: "verification_unavailable" };
  }
  const challenge = await input.cognito.startEmailOtp({
    username: user.username,
  });
  if (!challenge.ok || challenge.challengeName !== "EMAIL_OTP" ||
      challenge.session.length < 20) {
    return { ok: false, code: "verification_unavailable" };
  }

  const transactionHandle = (input.ids ?? defaultOtpIds).transactionHandle();
  const transaction = createOtpTransactionRecord({
    challengeCorrelationHash: otpChallengeCorrelationHash(challenge.session),
    cognitoUsername: user.username,
    emailFingerprint: fingerprints[0].fingerprint,
    emailFingerprintKeyVersion: fingerprints[0].keyVersion,
    enrollmentId: enrollment.enrollmentId,
    expiresAtEpochSeconds: Math.floor(now.getTime() / 1000) + otpChallengeMaxAgeSeconds,
    mode: "enrollment_verification",
    now: now.toISOString(),
    stripeCheckoutSessionId: enrollment.stripeCheckoutSessionId,
    stripeCustomerId: enrollment.stripeCustomerId,
    transactionDigest: otpTransactionDigest(transactionHandle),
  });
  const persisted = await input.repository.beginOtpVerification({
    enrollmentId: enrollment.enrollmentId,
    now: now.toISOString(),
    transaction,
  });
  if (!persisted.ok) {
    return { ok: false, code: "verification_unavailable" };
  }

  return {
    ok: true,
    status: "verification_code_sent",
    transactionHandle,
    challengeCookie: createOtpChallengeCookie({
      cognitoSession: challenge.session,
      cognitoUsername: user.username,
      now,
      secret: input.signingSecret,
      transactionHandle,
    }),
  };
}

const defaultOtpIds = {
  transactionHandle: () => `otp_handle_${randomBytes(32).toString("base64url")}`,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
