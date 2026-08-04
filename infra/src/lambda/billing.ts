import { createHash } from "node:crypto";
import {
  activateBillingAfterClinicalUnlock,
  cancelPatientSubscriptionAtPeriodEnd,
  createDynamoDbBillingActivationRepository,
  createUnsupportedMdiCancellationAction,
  type BillingActivationStage,
} from "../../../src/lib/billing-activation.js";
import {
  acceptBillingOffer,
  billingOfferAcceptanceGate,
  createBillingOffer,
  resolveBillingOfferConfig,
} from "../../../src/lib/billing-offer.js";
import {
  createDynamoDbPaymentMethodCollectionRepository,
  preparePaymentMethodCollection,
  type PaymentMethodStage,
} from "../../../src/lib/billing-payment-method.js";
import {
  mdiCaseStatusMirrorKey,
  mdiLinkageKey,
  patientProfileKey,
  stripeLinkageKey,
  type MdiCaseStatusMirrorRecord,
  type MdiLinkageRecord,
  type PatientProfileRecord,
  type StripeLinkageRecord,
} from "../../../src/lib/dynamodb/app-data.js";
import {
  createDynamoDbAppDataRepository,
  resolveDynamoDbAppDataConfig,
  type DynamoDbAppDataRepository,
} from "../../../src/lib/dynamodb/app-data-dynamodb.js";
import {
  resolveRuntimeStage,
  resolveStartupSecretSource,
  validateServerStartupSecrets,
} from "../../../src/lib/secrets/startup.js";
import { createStripeClient } from "../../../src/lib/stripe.js";
import {
  header,
  isSameOriginMutation,
  json,
  localOrConfiguredSiteOrigin,
  readPatientSession,
  parseJsonBody,
  type ApiGatewayEvent,
  type ApiGatewayResponse,
} from "./patient-api.js";

export async function offerHandler(event: ApiGatewayEvent): Promise<ApiGatewayResponse> {
  const session = await readPatientSession(event);
  if (!session.ok) {
    return json(session.status, { error: session.code });
  }
  const method = event.requestContext?.http?.method?.toUpperCase();
  if (method === "POST") {
    if (!isSameOriginMutation(event)) {
      return json(403, { code: "invalid_origin" });
    }
    if (!/^application\/json(?:;|$)/i.test(header(event, "content-type") ?? "")) {
      return json(415, { code: "invalid_content_type" });
    }
    if (
      header(event, "x-apoth-csrf") !==
        csrfTokenFor("billing-offer", session.session.token)
    ) {
      return json(403, { code: "invalid_csrf" });
    }
  } else if (method !== "GET") {
    return json(405, { error: "method_not_allowed" });
  }

  const repository = resolveRepository(process.env);
  const config = resolveBillingOfferConfig(process.env);
  if (!repository.ok || !config.ok) {
    return json(503, { error: "billing_offer_unavailable" });
  }
  const context = await readOfferContext(
    repository.value,
    session.session.cognitoSub,
  );
  if (!context.ok) {
    return json(context.status, { error: context.code });
  }
  if (context.stripe.billingStatus === "active") {
    return json(200, { status: "billing_active" });
  }
  const offer = createBillingOffer({
    config: config.value,
    mdiCaseId: context.mdi.mdiCaseId,
  });

  if (method === "GET") {
    const gate = await billingOfferAcceptanceGate(repository.value, {
      cognitoSub: session.session.cognitoSub,
      mdiCaseId: context.mdi.mdiCaseId,
      offerId: offer.offerId,
      stripePriceId: offer.stripePriceId,
    });
    if (gate.status === "storage_unavailable") {
      return json(503, { error: "billing_offer_unavailable" });
    }
    return json(200, {
      authorizationVersion: offer.authorizationVersion,
      csrfToken: csrfTokenFor("billing-offer", session.session.token),
      currency: offer.currency,
      interval: offer.interval,
      offerId: offer.offerId,
      status: gate.status === "accepted" ? "offer_accepted" : "offer_ready",
      unitAmountCents: offer.unitAmountCents,
    });
  }

  const body = parseJsonBody(event.body);
  if (
    !body.ok ||
    body.value.recurringAuthorization !== "accepted" ||
    typeof body.value.offerId !== "string"
  ) {
    return json(400, { error: "recurring_authorization_required" });
  }
  if (body.value.offerId !== offer.offerId) {
    return json(409, { error: "offer_changed" });
  }
  const accepted = await acceptBillingOffer(repository.value, {
    cognitoSub: session.session.cognitoSub,
    now: new Date().toISOString(),
    offer,
  });
  if (!accepted.ok) {
    return json(503, { error: "billing_offer_unavailable" });
  }
  if (process.env.APOTH_BILLING_ACTIVATION_ENABLED !== "true") {
    return json(200, { status: "offer_accepted" });
  }

  const secret = await resolveStripeSecret(process.env);
  if (!secret.ok) {
    return json(202, { status: "offer_accepted_activation_pending" });
  }
  const activated = await activateBillingAfterClinicalUnlock({
    cognitoSub: session.session.cognitoSub,
    mdiCaseId: context.mdi.mdiCaseId,
    now: new Date().toISOString(),
    offerConfig: config.value,
    repository: createDynamoDbBillingActivationRepository(repository.value),
    stage: resolveBillingCancellationStage(process.env),
    stripe: createStripeClient(secret.value),
  });
  const active = activated.ok && (
    activated.status === "subscription_created" ||
    activated.status === "already_subscribed"
  );
  return json(active ? 200 : 202, {
    status: active ? "billing_active" : "offer_accepted_activation_pending",
  });
}

export async function paymentMethodHandler(event: ApiGatewayEvent): Promise<ApiGatewayResponse> {
  const session = await readPatientSession(event);
  if (!session.ok) {
    return json(session.status, { error: session.code });
  }

  const repository = resolveRepository(process.env);
  const secret = await resolveStripeSecret(process.env);
  const returnUrls = billingReturnUrls(event);
  if (!repository.ok || !secret.ok || !returnUrls) {
    return json(503, { error: "billing_unavailable" });
  }

  const result = await preparePaymentMethodCollection({
    cognitoSub: session.session.cognitoSub,
    now: new Date().toISOString(),
    repository: createDynamoDbPaymentMethodCollectionRepository(repository.value),
    stage: resolvePaymentMethodStage(process.env),
    stripe: createStripeClient(secret.value),
    urls: returnUrls,
  });
  if (!result.ok) {
    const retryable = retryableBillingError(result.code);
    return json(
      retryable ? 503 : 409,
      { error: retryable ? "billing_unavailable" : result.code },
    );
  }

  if (result.status === "payment_method_already_collected") {
    return json(200, {
      billingStatus: result.billingStatus,
      status: result.status,
    });
  }

  return json(200, {
    billingStatus: result.billingStatus,
    checkoutSessionId: result.checkoutSessionId,
    checkoutUrl: result.checkoutUrl,
    status: result.status,
  });
}

export async function subscriptionCancelHandler(event: ApiGatewayEvent): Promise<ApiGatewayResponse> {
  if (!isSameOriginMutation(event)) {
    return json(403, { error: "invalid_origin" });
  }

  const session = await readPatientSession(event);
  if (!session.ok) {
    return json(session.status, { error: session.code });
  }

  const repository = resolveRepository(process.env);
  const secret = await resolveStripeSecret(process.env);
  if (!repository.ok || !secret.ok) {
    return json(503, { error: "billing_unavailable" });
  }

  const result = await cancelPatientSubscriptionAtPeriodEnd({
    cognitoSub: session.session.cognitoSub,
    mdiCancellationAction: createUnsupportedMdiCancellationAction(),
    now: new Date().toISOString(),
    repository: createDynamoDbBillingActivationRepository(repository.value),
    stage: resolveBillingCancellationStage(process.env),
    stripe: createStripeClient(secret.value),
  });
  if (!result.ok) {
    return json(503, { error: "billing_unavailable" });
  }
  if (result.status === "not_active") {
    return json(409, { error: "subscription_not_active" });
  }

  return json(200, { status: result.status });
}

async function readOfferContext(
  repository: DynamoDbAppDataRepository,
  cognitoSub: string,
): Promise<
  | {
      ok: true;
      mdi: MdiLinkageRecord & { mdiCaseId: string };
      stripe: StripeLinkageRecord;
    }
  | { ok: false; code: string; status: number }
> {
  const [profileResult, mdiResult, stripeResult] = await Promise.all([
    repository.get(patientProfileKey(cognitoSub)),
    repository.get(mdiLinkageKey(cognitoSub)),
    repository.get(stripeLinkageKey(cognitoSub)),
  ]);
  if (!profileResult.ok || !mdiResult.ok || !stripeResult.ok) {
    return { ok: false, code: "billing_offer_unavailable", status: 503 };
  }
  const profile = profileResult.value?.recordType === "patientProfile"
    ? profileResult.value as PatientProfileRecord
    : null;
  const mdi = mdiResult.value?.recordType === "mdiLinkage"
    ? mdiResult.value as MdiLinkageRecord
    : null;
  const stripe = stripeResult.value?.recordType === "stripeLinkage"
    ? stripeResult.value as StripeLinkageRecord
    : null;
  if (profile?.onboardingStatus !== "billing_ready" || !mdi?.mdiCaseId) {
    return { ok: false, code: "clinical_approval_required", status: 409 };
  }
  const mirrorResult = await repository.get(mdiCaseStatusMirrorKey(mdi.mdiCaseId));
  if (!mirrorResult.ok) {
    return { ok: false, code: "billing_offer_unavailable", status: 503 };
  }
  const mirror = mirrorResult.value?.recordType === "mdiCaseStatusMirror"
    ? mirrorResult.value as MdiCaseStatusMirrorRecord
    : null;
  if (mirror?.caseStatus !== "billing_ready") {
    return { ok: false, code: "clinical_approval_required", status: 409 };
  }
  if (
    !stripe ||
    (stripe.billingStatus !== "payment_method_collected" &&
      stripe.billingStatus !== "active")
  ) {
    return { ok: false, code: "payment_method_required", status: 409 };
  }
  return {
    ok: true,
    mdi: mdi as MdiLinkageRecord & { mdiCaseId: string },
    stripe,
  };
}

function csrfTokenFor(scope: string, token: string) {
  return createHash("sha256").update(`${scope}:${token}`).digest("base64url");
}

function resolveRepository(env: Record<string, string | undefined>) {
  const config = resolveDynamoDbAppDataConfig(env);
  return config.ok
    ? { ok: true as const, value: createDynamoDbAppDataRepository(config.value) }
    : { ok: false as const };
}

async function resolveStripeSecret(env: Record<string, string | undefined>) {
  const source = resolveStartupSecretSource({
    env,
    requiredSecrets: ["stripeApi"],
  });
  if (!source.ok) {
    return { ok: false as const };
  }
  const validated = await validateServerStartupSecrets({
    stage: resolveRuntimeStage(env),
    requiredSecrets: ["stripeApi"],
    source: source.value.source,
  });
  if (!validated.ok) {
    return { ok: false as const };
  }
  const secret = validated.value.find((value) => value.secretKind === "stripeApi");
  return secret
    ? { ok: true as const, value: secret }
    : { ok: false as const };
}

function resolvePaymentMethodStage(env: Record<string, string | undefined>): PaymentMethodStage {
  return env.APOTH_STAGE === "production" ? "production" : "staging";
}

function resolveBillingCancellationStage(env: Record<string, string | undefined>): BillingActivationStage {
  return env.APOTH_STAGE === "production" ? "production" : "staging";
}

function retryableBillingError(code: string) {
  return code === "storage_unavailable" ||
    code === "stripe_unavailable" ||
    code === "invalid_stripe_metadata";
}

function billingReturnUrls(event: ApiGatewayEvent) {
  const origin = localOrConfiguredSiteOrigin(event);
  if (!origin) {
    return null;
  }
  return {
    cancelUrl: `${origin}/billing`,
    successUrl: `${origin}/dashboard`,
  };
}
