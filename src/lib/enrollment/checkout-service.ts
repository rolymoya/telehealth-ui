import "server-only";

import type Stripe from "stripe";
import {
  type AppDataRepository,
  type AppDataResult,
  type PendingEnrollmentRecord,
  createPatientProfileRecord,
  linkStripeCustomer,
  patientProfileKey,
  pendingEnrollmentKey,
} from "@/lib/dynamodb/app-data";
import {
  type DynamoDbAppDataRepository,
  linkStripeCustomerDynamoDb,
} from "@/lib/dynamodb/app-data-dynamodb";
import {
  type CheckoutUiMode,
  createEnrollmentCheckoutParams,
  validateEnrollmentCheckoutSession,
} from "@/lib/stripe";
import type { PublicProductCode } from "@/lib/public-commerce";
import { checkoutConsentVersion } from "../../../shared/enrollment/checkout-consent";

export { checkoutConsentVersion };
const pendingEnrollmentLifetimeMs = 24 * 60 * 60 * 1000;

type EnrollmentSessionShape = {
  id: string;
  client_secret?: string | null;
  expires_at?: number | null;
  status?: string | null;
  ui_mode?: string | null;
  url?: string | null;
};

export type EnrollmentStripeClient = {
  checkout: {
    sessions: {
      create(
        params: Stripe.Checkout.SessionCreateParams,
        options?: Stripe.RequestOptions,
      ): Promise<EnrollmentSessionShape>;
      retrieve(id: string): Promise<EnrollmentSessionShape>;
    };
  };
};

export type EnrollmentRepository = {
  getEnrollment(enrollmentId: string):
    Promise<AppDataResult<PendingEnrollmentRecord | null>>;
  putEnrollment(record: PendingEnrollmentRecord):
    Promise<AppDataResult<PendingEnrollmentRecord>>;
  updateEnrollment(
    record: PendingEnrollmentRecord,
    expected: PendingEnrollmentRecord,
  ): Promise<AppDataResult<PendingEnrollmentRecord>>;
  bindIdentity(input: {
    cognitoSub: string;
    enrollment: PendingEnrollmentRecord;
    now: string;
  }): Promise<AppDataResult<PendingEnrollmentRecord>>;
};

export type InitializeEnrollmentCheckoutResult =
  | {
      ok: true;
      status: "checkout_session_created";
      uiMode: "custom";
      clientSecret: string;
    }
  | {
      ok: true;
      status: "checkout_session_created";
      uiMode: "hosted";
      checkoutUrl: string;
    }
  | {
      ok: true;
      status: "payment_setup_complete" | "identity_bound";
    }
  | {
      ok: false;
      code:
        | "enrollment_expired"
        | "invalid_product"
        | "storage_unavailable"
        | "stripe_unavailable";
    };

export function createInMemoryEnrollmentRepository(
  repository: AppDataRepository,
): EnrollmentRepository {
  return {
    async getEnrollment(enrollmentId) {
      return enrollmentFromRecord(repository.get(pendingEnrollmentKey(enrollmentId)));
    },
    async putEnrollment(record) {
      return repository.put(record, { ifNotExists: true });
    },
    async updateEnrollment(record, expected) {
      return repository.update(record, { expected });
    },
    async bindIdentity(input) {
      return bindIdentityWithRepository({
        ...input,
        get: async (key) => repository.get(key),
        putProfile: async (record) => repository.put(record, { ifNotExists: true }),
        linkStripe: async (linkInput) => linkStripeCustomer(repository, linkInput),
        updateEnrollment: async (record, expected) =>
          repository.update(record, { expected }),
      });
    },
  };
}

export function createDynamoDbEnrollmentRepository(
  repository: Pick<
    DynamoDbAppDataRepository,
    "get" | "put" | "transactWrite" | "update"
  >,
): EnrollmentRepository {
  return {
    async getEnrollment(enrollmentId) {
      return enrollmentFromRecord(
        await repository.get(pendingEnrollmentKey(enrollmentId)),
      );
    },
    async putEnrollment(record) {
      return repository.put(record, { ifNotExists: true });
    },
    async updateEnrollment(record, expected) {
      return repository.update(record, { expected });
    },
    async bindIdentity(input) {
      return bindIdentityWithRepository({
        ...input,
        get: (key) => repository.get(key),
        putProfile: (record) => repository.put(record, { ifNotExists: true }),
        linkStripe: (linkInput) =>
          linkStripeCustomerDynamoDb(repository, linkInput),
        updateEnrollment: (record, expected) =>
          repository.update(record, { expected }),
      });
    },
  };
}

export async function initializeEnrollmentCheckout(input: {
  enrollmentId: string;
  integrationIdentifier: string;
  now: string;
  productCode: PublicProductCode;
  repository: EnrollmentRepository;
  stage: "production" | "staging";
  stripe: EnrollmentStripeClient;
  uiMode: CheckoutUiMode;
  urls: {
    cancelUrl: string;
    returnUrl: string;
    successUrl: string;
  };
}): Promise<InitializeEnrollmentCheckoutResult> {
  if (input.productCode !== "weight") {
    return { ok: false, code: "invalid_product" };
  }

  let enrollment = await input.repository.getEnrollment(input.enrollmentId);
  if (!enrollment.ok) {
    return { ok: false, code: "storage_unavailable" };
  }
  if (!enrollment.value) {
    const record = createPendingEnrollment({
      enrollmentId: input.enrollmentId,
      now: input.now,
      productCode: input.productCode,
      uiMode: input.uiMode,
    });
    const created = await input.repository.putEnrollment(record);
    if (!created.ok) {
      enrollment = await input.repository.getEnrollment(input.enrollmentId);
      if (!enrollment.ok || !enrollment.value) {
        return { ok: false, code: "storage_unavailable" };
      }
    } else {
      enrollment = created;
    }
  }

  const enrollmentRecord = enrollment.value;
  if (!enrollmentRecord) {
    return { ok: false, code: "storage_unavailable" };
  }
  let current: PendingEnrollmentRecord = enrollmentRecord;
  if (Date.parse(current.expiresAt) <= Date.parse(input.now)) {
    return { ok: false, code: "enrollment_expired" };
  }
  if (current.productCode !== input.productCode) {
    return { ok: false, code: "invalid_product" };
  }
  if (current.status !== "checkout_session_pending") {
    return { ok: true, status: current.status };
  }

  if (current.checkoutSessionId) {
    const resumed = await retrieveSafeSession(
      input.stripe,
      current.checkoutSessionId,
      current.checkoutUiMode,
      input.now,
    );
    if (resumed.ok) {
      return responseForSafeSession(resumed.value);
    }
    if (!resumed.expired) {
      return { ok: false, code: "stripe_unavailable" };
    }
    const refreshed: PendingEnrollmentRecord = {
      ...current,
      checkoutAttempt: current.checkoutAttempt + 1,
      checkoutSessionId: undefined,
      updatedAt: input.now,
    };
    const updated = await input.repository.updateEnrollment(refreshed, current);
    if (!updated.ok) {
      const reread = await input.repository.getEnrollment(input.enrollmentId);
      if (!reread.ok || !reread.value) {
        return { ok: false, code: "storage_unavailable" };
      }
      current = reread.value;
      if (current.checkoutSessionId) {
        const concurrent = await retrieveSafeSession(
          input.stripe,
          current.checkoutSessionId,
          current.checkoutUiMode,
          input.now,
        );
        return concurrent.ok
          ? responseForSafeSession(concurrent.value)
          : { ok: false, code: "stripe_unavailable" };
      }
    } else {
      current = updated.value;
    }
  }

  const params = createEnrollmentCheckoutParams({
    cancelUrl: input.urls.cancelUrl,
    enrollmentId: current.enrollmentId,
    integrationIdentifier: input.integrationIdentifier,
    returnUrl: input.urls.returnUrl,
    stage: input.stage,
    successUrl: input.urls.successUrl,
    uiMode: current.checkoutUiMode,
  });
  if (!params.ok) {
    return { ok: false, code: "stripe_unavailable" };
  }

  let session: EnrollmentSessionShape;
  try {
    session = await input.stripe.checkout.sessions.create(params.value, {
      idempotencyKey: [
        "apoth",
        input.stage,
        "enrollment-checkout",
        current.enrollmentId,
        current.checkoutAttempt,
      ].join(":"),
    });
  } catch (error) {
    reportStripeCheckoutFailure("create", error);
    if (shouldAdvanceCheckoutAttempt(error)) {
      await input.repository.updateEnrollment({
        ...current,
        checkoutAttempt: current.checkoutAttempt + 1,
        updatedAt: input.now,
      }, current);
    }
    return { ok: false, code: "stripe_unavailable" };
  }
  const safe = validateEnrollmentCheckoutSession({
    clientSecret: session.client_secret,
    id: session.id,
    uiMode: current.checkoutUiMode,
    url: session.url,
  });
  if (!safe.ok) {
    reportUnsafeStripeCheckoutResponse("create", current.checkoutUiMode, session);
    return { ok: false, code: "stripe_unavailable" };
  }

  const withSession: PendingEnrollmentRecord = {
    ...current,
    checkoutSessionId: safe.value.checkoutSessionId,
    updatedAt: input.now,
  };
  const stored = await input.repository.updateEnrollment(withSession, current);
  if (!stored.ok) {
    const reread = await input.repository.getEnrollment(current.enrollmentId);
    if (
      !reread.ok ||
      !reread.value ||
      reread.value.checkoutSessionId !== safe.value.checkoutSessionId
    ) {
      return { ok: false, code: "storage_unavailable" };
    }
  }
  return responseForSafeSession(safe.value);
}

export async function recordEnrollmentConsent(input: {
  consentVersion: string;
  enrollmentId: string;
  now: string;
  repository: EnrollmentRepository;
}) {
  if (input.consentVersion !== checkoutConsentVersion) {
    return { ok: false as const, code: "consent_version_invalid" as const };
  }
  const found = await input.repository.getEnrollment(input.enrollmentId);
  if (!found.ok) {
    return { ok: false as const, code: "storage_unavailable" as const };
  }
  if (!found.value || Date.parse(found.value.expiresAt) <= Date.parse(input.now)) {
    return { ok: false as const, code: "enrollment_expired" as const };
  }
  if (found.value.consentAcceptedAt) {
    return {
      ok: true as const,
      acceptedAt: found.value.consentAcceptedAt,
      consentVersion: found.value.consentVersion!,
    };
  }
  const next: PendingEnrollmentRecord = {
    ...found.value,
    consentAcceptedAt: input.now,
    consentVersion: input.consentVersion,
    updatedAt: input.now,
  };
  const updated = await input.repository.updateEnrollment(next, found.value);
  if (!updated.ok) {
    return { ok: false as const, code: "storage_unavailable" as const };
  }
  return {
    ok: true as const,
    acceptedAt: updated.value.consentAcceptedAt!,
    consentVersion: updated.value.consentVersion!,
  };
}

export async function readEnrollmentStatus(input: {
  enrollmentId: string;
  now: string;
  repository: EnrollmentRepository;
}) {
  const found = await input.repository.getEnrollment(input.enrollmentId);
  if (!found.ok) {
    return { ok: false as const, code: "storage_unavailable" as const };
  }
  if (!found.value || Date.parse(found.value.expiresAt) <= Date.parse(input.now)) {
    return { ok: false as const, code: "enrollment_expired" as const };
  }
  return {
    ok: true as const,
    status: found.value.status,
    paymentSetupComplete: found.value.status !== "checkout_session_pending",
    identityBound: found.value.status === "identity_bound",
  };
}

export async function markEnrollmentPaymentSetupComplete(input: {
  checkoutSessionId?: string;
  enrollmentId: string;
  now: string;
  repository: EnrollmentRepository;
  stripeHostedConsentAccepted?: boolean;
  stripeCustomerId: string;
  stripeSetupIntentId: string;
}): Promise<AppDataResult<PendingEnrollmentRecord>> {
  const found = await input.repository.getEnrollment(input.enrollmentId);
  if (!found.ok) {
    return found;
  }
  if (!found.value) {
    return appDataError("not_found", "Pending enrollment was not found");
  }
  const hostedConsentAccepted =
    found.value.checkoutUiMode === "hosted" &&
    input.stripeHostedConsentAccepted === true;
  if (
    (!found.value.consentAcceptedAt || !found.value.consentVersion) &&
    !hostedConsentAccepted
  ) {
    return appDataError(
      "validation_failed",
      "Checkout consent was not recorded before payment setup",
    );
  }
  if (
    input.checkoutSessionId &&
    found.value.checkoutSessionId &&
    input.checkoutSessionId !== found.value.checkoutSessionId
  ) {
    return appDataError(
      "conditional_conflict",
      "Checkout Session did not match the pending enrollment",
    );
  }
  if (found.value.status !== "checkout_session_pending") {
    return found.value.stripeCustomerId === input.stripeCustomerId &&
      found.value.stripeSetupIntentId === input.stripeSetupIntentId
      ? { ok: true, value: found.value }
      : appDataError(
          "conditional_conflict",
          "Payment setup identifiers changed after completion",
        );
  }
  const next: PendingEnrollmentRecord = {
    ...found.value,
    checkoutSessionId: found.value.checkoutSessionId ?? input.checkoutSessionId,
    consentAcceptedAt: found.value.consentAcceptedAt ?? input.now,
    consentVersion: found.value.consentVersion ?? checkoutConsentVersion,
    paymentSetupCompletedAt: input.now,
    status: "payment_setup_complete",
    stripeCustomerId: input.stripeCustomerId,
    stripeSetupIntentId: input.stripeSetupIntentId,
    updatedAt: input.now,
  };
  return input.repository.updateEnrollment(next, found.value);
}

export async function bindVerifiedEnrollmentIdentity(input: {
  cognitoSub: string;
  enrollmentId: string;
  now: string;
  repository: EnrollmentRepository;
}) {
  const found = await input.repository.getEnrollment(input.enrollmentId);
  if (!found.ok) {
    return { ok: false as const, code: "storage_unavailable" as const };
  }
  if (!found.value || Date.parse(found.value.expiresAt) <= Date.parse(input.now)) {
    return { ok: false as const, code: "enrollment_expired" as const };
  }
  if (found.value.status === "checkout_session_pending") {
    return { ok: false as const, code: "payment_setup_pending" as const };
  }
  if (found.value.status === "identity_bound") {
    return found.value.cognitoSub === input.cognitoSub
      ? { ok: true as const, status: "identity_bound" as const, redirect: "/intake" }
      : { ok: false as const, code: "enrollment_already_bound" as const };
  }
  const bound = await input.repository.bindIdentity({
    cognitoSub: input.cognitoSub,
    enrollment: found.value,
    now: input.now,
  });
  return bound.ok
    ? { ok: true as const, status: "identity_bound" as const, redirect: "/intake" }
    : { ok: false as const, code: "storage_unavailable" as const };
}

function createPendingEnrollment(input: {
  enrollmentId: string;
  now: string;
  productCode: PublicProductCode;
  uiMode: CheckoutUiMode;
}): PendingEnrollmentRecord {
  const expiresAt = new Date(
    Date.parse(input.now) + pendingEnrollmentLifetimeMs,
  ).toISOString();
  return {
    ...pendingEnrollmentKey(input.enrollmentId),
    checkoutAttempt: 0,
    checkoutUiMode: input.uiMode,
    createdAt: input.now,
    enrollmentId: input.enrollmentId,
    expiresAt,
    expiresAtEpochSeconds: Math.floor(Date.parse(expiresAt) / 1000),
    productCode: input.productCode,
    recordType: "pendingEnrollment",
    schemaVersion: 1,
    status: "checkout_session_pending",
    updatedAt: input.now,
  };
}

async function retrieveSafeSession(
  stripe: EnrollmentStripeClient,
  sessionId: string,
  uiMode: CheckoutUiMode,
  now: string,
): Promise<
  | {
      ok: true;
      value: Extract<
        ReturnType<typeof validateEnrollmentCheckoutSession>,
        { ok: true }
      >["value"];
    }
  | { ok: false; expired: boolean }
> {
  let session: EnrollmentSessionShape;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (error) {
    reportStripeCheckoutFailure("retrieve", error);
    return { ok: false, expired: false };
  }
  if (
    session.status === "expired" ||
    (session.expires_at && session.expires_at * 1000 <= Date.parse(now))
  ) {
    return { ok: false, expired: true };
  }
  const safe = validateEnrollmentCheckoutSession({
    clientSecret: session.client_secret,
    id: session.id,
    uiMode,
    url: session.url,
  });
  if (!safe.ok) {
    reportUnsafeStripeCheckoutResponse("retrieve", uiMode, session);
  }
  return safe.ok
    ? { ok: true, value: safe.value }
    : { ok: false, expired: false };
}

function responseForSafeSession(
  session: Extract<
    ReturnType<typeof validateEnrollmentCheckoutSession>,
    { ok: true }
  >["value"],
): InitializeEnrollmentCheckoutResult {
  return session.uiMode === "custom"
    ? {
        ok: true,
        clientSecret: session.clientSecret,
        status: "checkout_session_created",
        uiMode: "custom",
      }
    : {
        ok: true,
        checkoutUrl: session.checkoutUrl,
        status: "checkout_session_created",
        uiMode: "hosted",
      };
}

function reportStripeCheckoutFailure(
  operation: "create" | "retrieve",
  error: unknown,
) {
  const candidate = error && typeof error === "object"
    ? error as Record<string, unknown>
    : {};
  const code = safeStripeDiagnostic(candidate.code);
  const type = safeStripeDiagnostic(candidate.type);
  const statusCode = typeof candidate.statusCode === "number" &&
      Number.isInteger(candidate.statusCode) &&
      candidate.statusCode >= 400 &&
      candidate.statusCode <= 599
    ? candidate.statusCode
    : undefined;
  console.error(JSON.stringify({
    event: "enrollment_checkout_stripe_failure",
    operation,
    ...(code ? { stripeCode: code } : {}),
    ...(type ? { stripeType: type } : {}),
    ...(statusCode ? { statusCode } : {}),
  }));
}

function safeStripeDiagnostic(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9_.-]{1,80}$/.test(value)
    ? value
    : undefined;
}

function shouldAdvanceCheckoutAttempt(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }
  const type = (error as Record<string, unknown>).type;
  return type === "StripeIdempotencyError" ||
    type === "StripeInvalidRequestError";
}

function reportUnsafeStripeCheckoutResponse(
  operation: "create" | "retrieve",
  expectedUiMode: CheckoutUiMode,
  session: EnrollmentSessionShape,
) {
  const clientSecret = typeof session.client_secret === "string"
    ? session.client_secret
    : "";
  const sessionId = typeof session.id === "string" ? session.id : "";
  console.error(JSON.stringify({
    event: "enrollment_checkout_stripe_response_invalid",
    operation,
    expectedUiMode,
    hasClientSecret: clientSecret.length > 0,
    hasId: sessionId.length > 0,
    hasUrl: typeof session.url === "string" && session.url.length > 0,
    clientSecretHasSecretMarker: clientSecret.includes("_secret_"),
    clientSecretStartsWithSessionId: Boolean(sessionId) &&
      clientSecret.startsWith(`${sessionId}_secret_`),
    clientSecretUsesExpectedAlphabet: /^[A-Za-z0-9_]+$/.test(clientSecret),
    clientSecretUsesUrlSafeAlphabet: /^[A-Za-z0-9_-]+$/.test(clientSecret),
    idUsesExpectedAlphabet: /^cs_(?:test|live)_[A-Za-z0-9_]+$/.test(sessionId),
    returnedStatus: safeStripeDiagnostic(session.status),
    returnedUiMode: safeStripeDiagnostic(session.ui_mode),
  }));
}

function enrollmentFromRecord(
  result: AppDataResult<
    import("@/lib/dynamodb/app-data").AppDataRecord | null
  >,
): AppDataResult<PendingEnrollmentRecord | null> {
  if (!result.ok || !result.value) {
    return result as AppDataResult<PendingEnrollmentRecord | null>;
  }
  return result.value.recordType === "pendingEnrollment"
    ? { ok: true, value: result.value }
    : appDataError(
        "validation_failed",
        "Pending enrollment key contained another record type",
      );
}

async function bindIdentityWithRepository(input: {
  cognitoSub: string;
  enrollment: PendingEnrollmentRecord;
  get: (
    key: import("@/lib/dynamodb/app-data").AppDataKey,
  ) => Promise<
    AppDataResult<import("@/lib/dynamodb/app-data").AppDataRecord | null>
  >;
  linkStripe: (
    input: Parameters<typeof linkStripeCustomer>[1],
  ) => Promise<AppDataResult<unknown>>;
  now: string;
  putProfile: (
    record: ReturnType<typeof createPatientProfileRecord>,
  ) => Promise<AppDataResult<unknown>>;
  updateEnrollment: (
    record: PendingEnrollmentRecord,
    expected: PendingEnrollmentRecord,
  ) => Promise<AppDataResult<PendingEnrollmentRecord>>;
}): Promise<AppDataResult<PendingEnrollmentRecord>> {
  if (
    !input.enrollment.stripeCustomerId ||
    input.enrollment.status !== "payment_setup_complete"
  ) {
    return appDataError(
      "stale_transition",
      "Payment setup is not complete",
    );
  }

  const profile = await input.get(patientProfileKey(input.cognitoSub));
  if (!profile.ok) {
    return profile;
  }
  if (!profile.value) {
    const created = await input.putProfile(createPatientProfileRecord({
      cognitoSub: input.cognitoSub,
      onboardingStatus: "profile_pending",
      now: input.now,
    }));
    if (!created.ok && created.error.kind !== "conditional_conflict") {
      return created as AppDataResult<PendingEnrollmentRecord>;
    }
  } else if (profile.value.recordType !== "patientProfile") {
    return appDataError(
      "validation_failed",
      "Patient profile key contained another record type",
    );
  }

  const linked = await input.linkStripe({
    allowedCurrentBillingStatuses: ["not_started", "payment_method_pending"],
    billingStatus: "payment_method_collected",
    cognitoSub: input.cognitoSub,
    now: input.now,
    stripeCustomerId: input.enrollment.stripeCustomerId,
  });
  if (!linked.ok && linked.error.kind !== "stale_transition") {
    return linked as AppDataResult<PendingEnrollmentRecord>;
  }

  const next: PendingEnrollmentRecord = {
    ...input.enrollment,
    cognitoSub: input.cognitoSub,
    identityBoundAt: input.now,
    status: "identity_bound",
    updatedAt: input.now,
  };
  const updated = await input.updateEnrollment(next, input.enrollment);
  if (updated.ok) {
    return updated;
  }
  const reread = await input.get(pendingEnrollmentKey(input.enrollment.enrollmentId));
  return reread.ok &&
    reread.value?.recordType === "pendingEnrollment" &&
    reread.value.status === "identity_bound" &&
    reread.value.cognitoSub === input.cognitoSub
    ? { ok: true as const, value: reread.value }
    : updated;
}

function appDataError(
  kind: import("@/lib/dynamodb/app-data").AppDataErrorKind,
  message: string,
): AppDataResult<never> {
  return { ok: false, error: { kind, message } };
}
