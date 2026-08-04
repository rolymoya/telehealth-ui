import "server-only";

import { randomBytes } from "node:crypto";
import {
  verifyAnonymousPrecheckContext,
  type AppSigningSecret,
} from "../../../shared/intake/anonymous-precheck-context";
import type { CognitoEmailOtpAdapter } from "@/lib/enrollment/cognito-otp";
import {
  cognitoUsernameForEmail,
  normalizeCheckoutEmail,
} from "@/lib/enrollment/identity";
import {
  createOtpChallengeCookie,
  verifyOtpChallengeCookie,
} from "@/lib/enrollment/otp-challenge-cookie";

export async function startPrecheckEmailOtp(input: {
  cognito: Pick<
    CognitoEmailOtpAdapter,
    "ensurePasswordlessUser" | "startEmailOtp"
  >;
  precheckContext?: string | null;
  email: string;
  ids?: { transactionHandle(): string };
  now?: Date;
  signingSecret: AppSigningSecret;
}): Promise<
  | {
      ok: true;
      challengeCookie: string;
      status: "verification_code_sent";
      transactionHandle: string;
    }
  | {
      ok: false;
      code: "invalid_email" | "precheck_required" | "verification_unavailable";
    }
> {
  const precheck = verifyAnonymousPrecheckContext({
    now: input.now,
    secret: input.signingSecret,
    value: input.precheckContext,
  });
  if (!precheck.ok) {
    return { ok: false, code: "precheck_required" };
  }
  const email = normalizeCheckoutEmail(input.email);
  if (!email.ok) {
    return { ok: false, code: "invalid_email" };
  }
  const preferredUsername = cognitoUsernameForEmail({
    email: email.value,
    secret: { keyVersion: 1, secret: input.signingSecret.signingSecret },
  });
  if (!preferredUsername) {
    return { ok: false, code: "invalid_email" };
  }

  const user = await input.cognito.ensurePasswordlessUser({
    email: email.value,
    preferredUsername,
  });
  if (!user.ok) {
    return { ok: false, code: "verification_unavailable" };
  }
  const challenge = await input.cognito.startEmailOtp({
    username: user.username,
  });
  if (
    !challenge.ok ||
    challenge.challengeName !== "EMAIL_OTP" ||
    challenge.session.length < 20
  ) {
    return { ok: false, code: "verification_unavailable" };
  }

  const transactionHandle = (input.ids ?? defaultIds).transactionHandle();
  return {
    ok: true,
    challengeCookie: createOtpChallengeCookie({
      cognitoSession: challenge.session,
      cognitoUsername: user.username,
      now: input.now,
      secret: input.signingSecret,
      transactionHandle,
    }),
    status: "verification_code_sent",
    transactionHandle,
  };
}

export async function confirmPrecheckEmailOtp(input: {
  challengeCookie?: string | null;
  code: string;
  cognito: Pick<CognitoEmailOtpAdapter, "confirmEmailOtp">;
  now?: Date;
  signingSecret: AppSigningSecret;
  transactionHandle: string;
  verifyAccessToken(token: string): Promise<{ ok: true } | { ok: false }>;
}): Promise<
  | {
      ok: true;
      accessToken: string;
      expiresIn: number;
      status: "account_verified";
    }
  | {
      ok: false;
      code:
        | "invalid_verification"
        | "verification_rate_limited"
        | "verification_unavailable";
    }
> {
  if (!/^\d{6}$/.test(input.code) || input.transactionHandle.length < 16) {
    return { ok: false, code: "invalid_verification" };
  }
  const challenge = verifyOtpChallengeCookie({
    now: input.now,
    secret: input.signingSecret,
    value: input.challengeCookie,
  });
  if (
    !challenge.ok ||
    challenge.payload.transactionHandle !== input.transactionHandle
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
  if (!verified.ok) {
    return { ok: false, code: "verification_unavailable" };
  }

  return {
    ok: true,
    accessToken: authentication.accessToken,
    expiresIn: authentication.expiresIn,
    status: "account_verified",
  };
}

const defaultIds = {
  transactionHandle: () => `otp_handle_${randomBytes(32).toString("base64url")}`,
};
