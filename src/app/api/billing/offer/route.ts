import { type NextRequest } from "next/server";
import {
  csrfTokenFor,
  noStoreJson,
  readJsonObject,
  readPatientRouteSession,
  resolveAppDataRepository,
  verifyJsonMutation,
} from "@/app/api/_shared/onboarding";
import {
  acceptBillingOffer,
  billingOfferAcceptanceGate,
  createBillingOffer,
  resolveBillingOfferConfig,
} from "@/lib/billing-offer";
import { activateBillingAfterClinicalUnlock, createDynamoDbBillingActivationRepository } from "@/lib/billing-activation";
import {
  mdiCaseStatusMirrorKey,
  mdiLinkageKey,
  patientProfileKey,
  stripeLinkageKey,
  type MdiCaseStatusMirrorRecord,
  type MdiLinkageRecord,
  type PatientProfileRecord,
  type StripeLinkageRecord,
} from "@/lib/dynamodb/app-data";
import { resolveRuntimeStage, resolveStartupSecretSource, validateServerStartupSecrets } from "@/lib/secrets/startup";
import { createStripeClient } from "@/lib/stripe";
import type { DynamoDbAppDataRepository } from "@/lib/dynamodb/app-data-dynamodb";

export async function GET(request: NextRequest) {
  const session = await readPatientRouteSession(request, "billing_offer_unavailable");
  if (!session.ok) {
    return noStoreJson(session.body, session.status);
  }
  const repository = resolveAppDataRepository(process.env);
  const config = resolveBillingOfferConfig(process.env);
  if (!repository.ok || !config.ok) {
    return noStoreJson({ error: "billing_offer_unavailable" }, 503);
  }
  const context = await readOfferContext(
    repository.value,
    session.value.session.user.cognitoSub,
  );
  if (!context.ok) {
    return noStoreJson({ error: context.code }, context.status);
  }
  if (context.stripe.billingStatus === "active") {
    return noStoreJson({ status: "billing_active" });
  }
  const offer = createBillingOffer({
    config: config.value,
    mdiCaseId: context.mdi.mdiCaseId,
  });
  const gate = await billingOfferAcceptanceGate(repository.value, {
    cognitoSub: session.value.session.user.cognitoSub,
    mdiCaseId: context.mdi.mdiCaseId,
    offerId: offer.offerId,
    stripePriceId: offer.stripePriceId,
  });
  if (gate.status === "storage_unavailable") {
    return noStoreJson({ error: "billing_offer_unavailable" }, 503);
  }
  return noStoreJson({
    authorizationVersion: offer.authorizationVersion,
    csrfToken: csrfTokenFor("billing-offer", session.value.token),
    currency: offer.currency,
    interval: offer.interval,
    offerId: offer.offerId,
    status: gate.status === "accepted" ? "offer_accepted" : "offer_ready",
    unitAmountCents: offer.unitAmountCents,
  });
}

export async function POST(request: NextRequest) {
  const session = await verifyJsonMutation(request, {
    csrfScope: "billing-offer",
    unavailableCode: "billing_offer_unavailable",
  });
  if (!session.ok) {
    return noStoreJson(session.body, session.status);
  }
  const body = await readJsonObject(request);
  if (
    body?.recurringAuthorization !== "accepted" ||
    typeof body.offerId !== "string"
  ) {
    return noStoreJson({ error: "recurring_authorization_required" }, 400);
  }

  const repository = resolveAppDataRepository(process.env);
  const config = resolveBillingOfferConfig(process.env);
  if (!repository.ok || !config.ok) {
    return noStoreJson({ error: "billing_offer_unavailable" }, 503);
  }
  const cognitoSub = session.value.session.user.cognitoSub;
  const context = await readOfferContext(repository.value, cognitoSub);
  if (!context.ok) {
    return noStoreJson({ error: context.code }, context.status);
  }
  const offer = createBillingOffer({
    config: config.value,
    mdiCaseId: context.mdi.mdiCaseId,
  });
  if (body.offerId !== offer.offerId) {
    return noStoreJson({ error: "offer_changed" }, 409);
  }
  const accepted = await acceptBillingOffer(repository.value, {
    cognitoSub,
    now: new Date().toISOString(),
    offer,
  });
  if (!accepted.ok) {
    return noStoreJson({ error: "billing_offer_unavailable" }, 503);
  }

  if (process.env.APOTH_BILLING_ACTIVATION_ENABLED !== "true") {
    return noStoreJson({ status: "offer_accepted" });
  }
  const stripeSecret = await resolveStripeSecret(process.env);
  if (!stripeSecret.ok) {
    return noStoreJson({ status: "offer_accepted_activation_pending" }, 202);
  }
  const activated = await activateBillingAfterClinicalUnlock({
    cognitoSub,
    mdiCaseId: context.mdi.mdiCaseId,
    now: new Date().toISOString(),
    offerConfig: config.value,
    repository: createDynamoDbBillingActivationRepository(repository.value),
    stage: process.env.APOTH_STAGE === "production" ? "production" : "staging",
    stripe: createStripeClient(stripeSecret.value),
  });
  if (!activated.ok) {
    return noStoreJson({ status: "offer_accepted_activation_pending" }, 202);
  }
  return noStoreJson({
    status: activated.status === "subscription_created" ||
        activated.status === "already_subscribed"
      ? "billing_active"
      : "offer_accepted_activation_pending",
  }, activated.status === "subscription_created" || activated.status === "already_subscribed"
    ? 200
    : 202);
}

async function readOfferContext(
  repository: DynamoDbAppDataRepository,
  cognitoSub: string,
): Promise<
  | { ok: true; mdi: MdiLinkageRecord & { mdiCaseId: string }; stripe: StripeLinkageRecord }
  | { ok: false; code: string; status: number }
> {
  const [profileResult, mdiResult, stripeResult] = await Promise.all([
    repository.get(patientProfileKey(cognitoSub)),
    repository.get(mdiLinkageKey(cognitoSub)),
    repository.get(stripeLinkageKey(cognitoSub)),
  ]);
  const profile = profileResult.ok && profileResult.value?.recordType === "patientProfile"
    ? profileResult.value as PatientProfileRecord
    : null;
  const mdi = mdiResult.ok && mdiResult.value?.recordType === "mdiLinkage"
    ? mdiResult.value as MdiLinkageRecord
    : null;
  const stripe = stripeResult.ok && stripeResult.value?.recordType === "stripeLinkage"
    ? stripeResult.value as StripeLinkageRecord
    : null;
  if (!profileResult.ok || !mdiResult.ok || !stripeResult.ok) {
    return { ok: false, code: "billing_offer_unavailable", status: 503 };
  }
  if (profile?.onboardingStatus !== "billing_ready" || !mdi?.mdiCaseId) {
    return { ok: false, code: "clinical_approval_required", status: 409 };
  }
  const mirrorResult = await repository.get(mdiCaseStatusMirrorKey(mdi.mdiCaseId));
  const mirror = mirrorResult.ok && mirrorResult.value?.recordType === "mdiCaseStatusMirror"
    ? mirrorResult.value as MdiCaseStatusMirrorRecord
    : null;
  if (!mirrorResult.ok) {
    return { ok: false, code: "billing_offer_unavailable", status: 503 };
  }
  if (mirror?.caseStatus !== "billing_ready") {
    return { ok: false, code: "clinical_approval_required", status: 409 };
  }
  if (!stripe || stripe.billingStatus !== "payment_method_collected" && stripe.billingStatus !== "active") {
    return { ok: false, code: "payment_method_required", status: 409 };
  }
  return { ok: true, mdi: mdi as MdiLinkageRecord & { mdiCaseId: string }, stripe };
}

async function resolveStripeSecret(env: Record<string, string | undefined>) {
  const source = resolveStartupSecretSource({ env, requiredSecrets: ["stripeApi"] });
  if (!source.ok) return { ok: false as const };
  const validated = await validateServerStartupSecrets({
    stage: resolveRuntimeStage(env),
    requiredSecrets: ["stripeApi"],
    source: source.value.source,
  });
  const secret = validated.ok
    ? validated.value.find((value) => value.secretKind === "stripeApi")
    : undefined;
  return secret ? { ok: true as const, value: secret } : { ok: false as const };
}
