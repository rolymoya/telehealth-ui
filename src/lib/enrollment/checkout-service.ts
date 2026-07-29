import "server-only";

import { createHash, randomBytes } from "node:crypto";
import type Stripe from "stripe";
import type { AppSigningSecret } from "../../../shared/intake/anonymous-precheck-context";
import {
  createEnrollmentAttemptCookie,
  enrollmentAttemptBindingHash,
  enrollmentAttemptMaxAgeSeconds,
} from "@/lib/enrollment/attempt-cookie";
import {
  createEnrollmentRecord,
  createExternalOperationRecord,
} from "@/lib/enrollment/records";
import type { EnrollmentRepository } from "@/lib/enrollment/repository";
import { applyEnrollmentTransition } from "@/lib/enrollment/state-machine";
import { createEnrollmentSetupCheckoutParams } from "@/lib/stripe";

export type EnrollmentCatalogEntry = {
  cancelPath: `/${string}`;
  internalCatalogCode: string;
};

export type EnrollmentCatalog = {
  resolve(publicCode: string): EnrollmentCatalogEntry | null;
};

type EnrollmentCheckoutStripeClient = {
  checkout: {
    sessions: {
      create(
        params: Stripe.Checkout.SessionCreateParams,
        options: Stripe.RequestOptions,
      ): Promise<{ id: string; url: string | null }>;
    };
  };
};

export type BeginEnrollmentCheckoutResult =
  | {
    ok: true;
    status: "checkout_session_created";
    checkoutUrl: string;
    attemptCookie: string;
  }
  | {
    ok: false;
    code:
      | "catalog_unavailable"
      | "checkout_configuration_invalid"
      | "checkout_unavailable"
      | "storage_unavailable";
  };

export async function beginEnrollmentCheckout(input: {
  publicCatalogCode: string;
  catalog: EnrollmentCatalog;
  repository: EnrollmentRepository;
  stripe: EnrollmentCheckoutStripeClient;
  signingSecret: AppSigningSecret;
  stage: "staging" | "production";
  marketingOrigin: string;
  successOrigin: string;
  integrationIdentifier: string;
  now?: Date;
  ids?: {
    attemptSecret(): string;
    enrollmentId(): string;
    leaseOwner(): string;
  };
}): Promise<BeginEnrollmentCheckoutResult> {
  const catalogEntry = input.catalog.resolve(input.publicCatalogCode);
  if (!catalogEntry) {
    return { ok: false, code: "catalog_unavailable" };
  }

  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const nowEpochSeconds = Math.floor(now.getTime() / 1000);
  const ids = input.ids ?? defaultEnrollmentCheckoutIds;
  const enrollmentId = ids.enrollmentId();
  const attemptSecret = ids.attemptSecret();
  const operationId = `operation_stripe_checkout_${enrollmentId}`;
  const idempotencyKey = `apoth:${input.stage}:stripe_checkout:${enrollmentId}`;

  const urls = enrollmentCheckoutUrls({
    cancelPath: catalogEntry.cancelPath,
    marketingOrigin: input.marketingOrigin,
    stage: input.stage,
    successOrigin: input.successOrigin,
  });
  if (!urls) {
    return { ok: false, code: "checkout_configuration_invalid" };
  }

  const params = createEnrollmentSetupCheckoutParams({
    apothOrderId: enrollmentId,
    apothStage: input.stage,
    cancelUrl: urls.cancelUrl,
    expiresAt: nowEpochSeconds + enrollmentAttemptMaxAgeSeconds,
    integrationIdentifier: input.integrationIdentifier,
    successUrl: urls.successUrl,
  });
  if (!params.ok) {
    return { ok: false, code: "checkout_configuration_invalid" };
  }

  const enrollment = createEnrollmentRecord({
    attemptBindingHash: enrollmentAttemptBindingHash(attemptSecret),
    catalogCode: catalogEntry.internalCatalogCode,
    enrollmentId,
    expiresAtEpochSeconds: nowEpochSeconds + enrollmentAttemptMaxAgeSeconds,
    now: nowIso,
  });
  const operation = createExternalOperationRecord({
    aggregateId: enrollmentId,
    expiresAtEpochSeconds: nowEpochSeconds + 24 * 60 * 60,
    idempotencyKeyDigest: sha256(idempotencyKey),
    maxAttempts: 5,
    now: nowIso,
    operationId,
    operationType: "stripe_checkout",
  });
  const created = await input.repository.createCheckoutAttempt({
    enrollment,
    operation,
  });
  if (!created.ok) {
    return { ok: false, code: "storage_unavailable" };
  }

  const leaseOwner = ids.leaseOwner();
  const leased = await input.repository.leaseExternalOperation({
    leaseExpiresAtEpochSeconds: nowEpochSeconds + 60,
    now: nowIso,
    nowEpochSeconds,
    operationId,
    owner: leaseOwner,
  });
  if (!leased.ok) {
    return { ok: false, code: "storage_unavailable" };
  }

  let session: { id: string; url: string | null };
  try {
    session = await input.stripe.checkout.sessions.create(params.value, {
      idempotencyKey,
    });
  } catch {
    await markCheckoutRetryable(input.repository, {
      errorCode: "stripe_request_ambiguous",
      leaseOwner,
      now,
      operationId,
    });
    return { ok: false, code: "checkout_unavailable" };
  }

  if (!safeStripeCheckoutSession(session)) {
    await markCheckoutRetryable(input.repository, {
      errorCode: "stripe_session_unusable",
      leaseOwner,
      now,
      operationId,
    });
    return { ok: false, code: "checkout_unavailable" };
  }

  const succeeded = await input.repository.markExternalOperationSucceeded({
    completedAt: new Date(now.getTime() + 1).toISOString(),
    operationId,
    owner: leaseOwner,
    resultPointer: session.id,
  });
  if (!succeeded.ok) {
    return { ok: false, code: "storage_unavailable" };
  }

  const transitioned = applyEnrollmentTransition(enrollment, {
    changes: { checkout: "open" },
  });
  if (!transitioned.ok) {
    return { ok: false, code: "checkout_configuration_invalid" };
  }
  const updated = await input.repository.updateEnrollment({
    ...enrollment,
    ...transitioned.value,
    stripeCheckoutSessionId: session.id,
    updatedAt: new Date(now.getTime() + 2).toISOString(),
    version: enrollment.version + 1,
  }, enrollment.version);
  if (!updated.ok) {
    return { ok: false, code: "storage_unavailable" };
  }

  return {
    ok: true,
    status: "checkout_session_created",
    checkoutUrl: session.url,
    attemptCookie: createEnrollmentAttemptCookie({
      attemptSecret,
      enrollmentId,
      now,
      secret: input.signingSecret,
    }),
  };
}

async function markCheckoutRetryable(
  repository: EnrollmentRepository,
  input: {
    errorCode: string;
    leaseOwner: string;
    now: Date;
    operationId: string;
  },
) {
  const nowEpochSeconds = Math.floor(input.now.getTime() / 1000);
  await repository.markExternalOperationRetryable({
    errorCode: input.errorCode,
    failedAt: input.now.toISOString(),
    nextAttemptAtEpochSeconds: nowEpochSeconds + 5,
    operationId: input.operationId,
    owner: input.leaseOwner,
  });
}

function enrollmentCheckoutUrls(input: {
  cancelPath: `/${string}`;
  marketingOrigin: string;
  stage: "staging" | "production";
  successOrigin: string;
}) {
  try {
    const marketingOrigin = new URL(input.marketingOrigin);
    const successOrigin = new URL(input.successOrigin);
    if (
      !isAllowedCheckoutOrigin(marketingOrigin, input.stage) ||
      !isAllowedCheckoutOrigin(successOrigin, input.stage) ||
      marketingOrigin.pathname !== "/" ||
      successOrigin.pathname !== "/" ||
      marketingOrigin.search ||
      successOrigin.search ||
      marketingOrigin.hash ||
      successOrigin.hash
    ) {
      return null;
    }
    return {
      cancelUrl: new URL(input.cancelPath, marketingOrigin).toString(),
      successUrl: `${successOrigin.origin}/api/enrollment/checkout-return?session_id={CHECKOUT_SESSION_ID}`,
    };
  } catch {
    return null;
  }
}

function isAllowedCheckoutOrigin(
  url: URL,
  stage: "staging" | "production",
) {
  if (url.protocol === "https:") {
    return true;
  }
  return stage === "staging" &&
    url.protocol === "http:" &&
    (url.hostname === "127.0.0.1" || url.hostname === "localhost");
}

function safeStripeCheckoutSession(
  session: { id: string; url: string | null },
): session is { id: string; url: string } {
  if (!session.id.startsWith("cs_") || !session.url) {
    return false;
  }
  try {
    const url = new URL(session.url);
    return url.protocol === "https:" &&
      url.hostname === "checkout.stripe.com" &&
      url.username === "" &&
      url.password === "";
  } catch {
    return false;
  }
}

function sha256(value: string) {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

const defaultEnrollmentCheckoutIds = {
  attemptSecret: () => randomBytes(32).toString("base64url"),
  enrollmentId: () => `apoth_order_${randomBytes(18).toString("hex")}`,
  leaseOwner: () => `checkout_worker_${randomBytes(12).toString("hex")}`,
};
