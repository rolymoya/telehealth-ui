import "server-only";

import type { AppSigningSecret } from "../../../shared/intake/anonymous-precheck-context";
import {
  enrollmentAttemptMatchesBinding,
  verifyEnrollmentAttemptCookie,
} from "@/lib/enrollment/attempt-cookie";
import type { CognitoEmailOtpAdapter } from "@/lib/enrollment/cognito-otp";
import {
  otpChallengeCorrelationHash,
  otpTransactionDigest,
  verifyOtpChallengeCookie,
} from "@/lib/enrollment/otp-challenge-cookie";
import type { EnrollmentRepository } from "@/lib/enrollment/repository";

export async function confirmEnrollmentEmailOtp(input: {
  attemptCookie?: string | null;
  challengeCookie?: string | null;
  code: string;
  cognito: Pick<CognitoEmailOtpAdapter, "confirmEmailOtp">;
  now?: Date;
  repository: EnrollmentRepository;
  signingSecret: AppSigningSecret;
  transactionHandle: string;
  verifyAccessToken(token: string): Promise<
    | { ok: true; cognitoSub: string }
    | { ok: false }
  >;
}): Promise<
  | {
    ok: true;
    status: "account_created";
    accessToken: string;
    expiresIn: number;
  }
  | {
    ok: false;
    code:
      | "invalid_verification"
      | "verification_rate_limited"
      | "verification_unavailable";
  }
> {
  const now = input.now ?? new Date();
  if (!/^\d{6}$/.test(input.code) || input.transactionHandle.length < 16) {
    return { ok: false, code: "invalid_verification" };
  }

  const attempt = verifyEnrollmentAttemptCookie({
    now,
    secret: input.signingSecret,
    value: input.attemptCookie,
  });
  const challenge = verifyOtpChallengeCookie({
    now,
    secret: input.signingSecret,
    value: input.challengeCookie,
  });
  if (
    !attempt.ok ||
    !challenge.ok ||
    challenge.payload.transactionHandle !== input.transactionHandle
  ) {
    return { ok: false, code: "invalid_verification" };
  }

  const transactionDigest = otpTransactionDigest(input.transactionHandle);
  const [enrollmentResult, transactionResult] = await Promise.all([
    input.repository.getEnrollment(attempt.payload.enrollmentId),
    input.repository.getOtpTransaction(transactionDigest),
  ]);
  if (!enrollmentResult.ok || !transactionResult.ok) {
    return { ok: false, code: "verification_unavailable" };
  }
  const enrollment = enrollmentResult.value;
  const transaction = transactionResult.value;
  if (
    !enrollment ||
    !transaction ||
    !enrollmentAttemptMatchesBinding(
      attempt.payload.attemptSecret,
      enrollment.attemptBindingHash,
    ) ||
    enrollment.identity !== "verification_pending" ||
    transaction.mode !== "enrollment_verification" ||
    transaction.state !== "ready" ||
    transaction.expiresAtEpochSeconds <= Math.floor(now.getTime() / 1000) ||
    transaction.enrollmentId !== enrollment.enrollmentId ||
    transaction.stripeCustomerId !== enrollment.stripeCustomerId ||
    transaction.stripeCheckoutSessionId !== enrollment.stripeCheckoutSessionId ||
    transaction.cognitoUsername !== challenge.payload.cognitoUsername ||
    transaction.challengeCorrelationHash !==
      otpChallengeCorrelationHash(challenge.payload.cognitoSession)
  ) {
    return { ok: false, code: "invalid_verification" };
  }

  const authentication = await input.cognito.confirmEmailOtp({
    code: input.code,
    session: challenge.payload.cognitoSession,
    username: challenge.payload.cognitoUsername,
  });
  if (!authentication.ok) {
    return {
      ok: false,
      code: authentication.code === "rate_limited"
        ? "verification_rate_limited"
        : authentication.code === "invalid_code"
          ? "invalid_verification"
          : "verification_unavailable",
    };
  }

  const verified = await input.verifyAccessToken(authentication.accessToken);
  if (!verified.ok || !verified.cognitoSub) {
    return { ok: false, code: "verification_unavailable" };
  }
  const binding = await input.repository.bindVerifiedEnrollment({
    cognitoSub: verified.cognitoSub,
    consumedAt: now.toISOString(),
    enrollmentId: enrollment.enrollmentId,
    transactionDigest,
  });
  if (!binding.ok) {
    return { ok: false, code: "verification_unavailable" };
  }

  return {
    ok: true,
    status: "account_created",
    accessToken: authentication.accessToken,
    expiresIn: authentication.expiresIn,
  };
}
