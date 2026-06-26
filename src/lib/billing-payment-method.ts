import "server-only";

import { createHash } from "node:crypto";
import type Stripe from "stripe";
import {
  type AppDataKey,
  type AppDataRecord,
  type AppDataRepository,
  type AppDataResult,
  type BillingStatus,
  type MdiCaseStatusMirrorRecord,
  type MdiLinkageRecord,
  type PatientProfileRecord,
  type StripeLinkageRecord,
  getMdiLinkage,
  getPatientProfile,
  getStripeLinkage,
  linkStripeCustomer,
  mdiCaseStatusMirrorKey,
  patientProfileKey,
} from "@/lib/dynamodb/app-data";
import {
  type DynamoDbAppDataRepository,
  getMdiLinkageDynamoDb,
  getStripeLinkageDynamoDb,
  linkStripeCustomerDynamoDb,
} from "@/lib/dynamodb/app-data-dynamodb";
import {
  createPaymentMethodSetupCheckoutParams,
  createStripeCustomerParams,
} from "@/lib/stripe";

export type PaymentMethodStage = "production" | "staging";

export type PaymentMethodCollectionResult =
  | {
      ok: true;
      status: "payment_method_already_collected";
      billingStatus: "payment_method_collected";
      stripeCustomerId: string;
    }
  | {
      ok: true;
      status: "checkout_session_created";
      billingStatus: "payment_method_pending";
      checkoutSessionId: string;
      checkoutUrl: string;
      stripeCustomerId: string;
    }
  | {
      ok: false;
      code:
        | "active_billing_exists"
        | "billing_closed"
        | "clinical_declined"
        | "invalid_stripe_metadata"
        | "payment_not_ready"
        | "storage_unavailable"
        | "stripe_unavailable";
    };

export type PaymentMethodCollectionRepository = {
  getMdiCaseStatusMirror(mdiCaseId: string):
    Promise<AppDataResult<MdiCaseStatusMirrorRecord | null>>;
  getMdiLinkage(cognitoSub: string): Promise<AppDataResult<MdiLinkageRecord | null>>;
  getPatientProfile(cognitoSub: string): Promise<AppDataResult<PatientProfileRecord | null>>;
  getStripeLinkage(cognitoSub: string): Promise<AppDataResult<StripeLinkageRecord | null>>;
  linkStripeCustomer(input: {
    allowedCurrentBillingStatuses?: BillingStatus[];
    billingStatus: BillingStatus;
    cognitoSub: string;
    now: string;
    stripeBillingStatusObservedAt?: string;
    stripeCustomerId: string;
    stripeSubscriptionId?: string;
  }): Promise<AppDataResult<StripeLinkageRecord>>;
};

type StripeCheckoutSessionCreate = (
  params: Stripe.Checkout.SessionCreateParams,
  options?: Stripe.RequestOptions,
) => Promise<{ id: string; url: string | null }>;

export type PaymentMethodStripeClient = {
  checkout: { sessions: { create: StripeCheckoutSessionCreate } };
  customers: Pick<Stripe.CustomerResource, "create">;
};

export function createInMemoryPaymentMethodCollectionRepository(
  repository: AppDataRepository,
): PaymentMethodCollectionRepository {
  return {
    async getMdiCaseStatusMirror(mdiCaseId) {
      const record = repository.get(mdiCaseStatusMirrorKey(mdiCaseId));
      if (!record.ok || !record.value) {
        return record as AppDataResult<MdiCaseStatusMirrorRecord | null>;
      }
      if (record.value.recordType !== "mdiCaseStatusMirror") {
        return appDataErr("MDI case status mirror key contained another record type");
      }
      return { ok: true, value: record.value };
    },
    async getMdiLinkage(cognitoSub) {
      return getMdiLinkage(repository, cognitoSub);
    },
    async getPatientProfile(cognitoSub) {
      return getPatientProfile(repository, cognitoSub);
    },
    async getStripeLinkage(cognitoSub) {
      return getStripeLinkage(repository, cognitoSub);
    },
    async linkStripeCustomer(input) {
      return linkStripeCustomer(repository, input);
    },
  };
}

export function createDynamoDbPaymentMethodCollectionRepository(
  repository: Pick<DynamoDbAppDataRepository, "get" | "transactWrite">,
): PaymentMethodCollectionRepository {
  return {
    async getMdiCaseStatusMirror(mdiCaseId) {
      const record = await repository.get(mdiCaseStatusMirrorKey(mdiCaseId));
      if (!record.ok || !record.value) {
        return record as AppDataResult<MdiCaseStatusMirrorRecord | null>;
      }
      if (record.value.recordType !== "mdiCaseStatusMirror") {
        return appDataErr("MDI case status mirror key contained another record type");
      }
      return { ok: true, value: record.value };
    },
    async getMdiLinkage(cognitoSub) {
      return getMdiLinkageDynamoDb(repository, cognitoSub);
    },
    async getPatientProfile(cognitoSub) {
      const record = await repository.get(patientProfileKey(cognitoSub));
      if (!record.ok || !record.value) {
        return record as AppDataResult<PatientProfileRecord | null>;
      }
      if (record.value.recordType !== "patientProfile") {
        return appDataErr("Patient profile key contained another record type");
      }
      return { ok: true, value: record.value };
    },
    async getStripeLinkage(cognitoSub) {
      return getStripeLinkageDynamoDb(repository, cognitoSub);
    },
    async linkStripeCustomer(input) {
      return linkStripeCustomerDynamoDb(repository, input);
    },
  };
}

export async function preparePaymentMethodCollection(input: {
  cognitoSub: string;
  now: string;
  repository: PaymentMethodCollectionRepository;
  stage: PaymentMethodStage;
  stripe: PaymentMethodStripeClient;
  urls: {
    cancelUrl: string;
    successUrl: string;
  };
}): Promise<PaymentMethodCollectionResult> {
  const profile = await input.repository.getPatientProfile(input.cognitoSub);
  if (!profile.ok) {
    return { ok: false, code: "storage_unavailable" };
  }
  if (!profile.value || !canCollectPaymentMethodForProfile(profile.value.onboardingStatus)) {
    return { ok: false, code: "payment_not_ready" };
  }

  const mdi = await input.repository.getMdiLinkage(input.cognitoSub);
  if (!mdi.ok) {
    return { ok: false, code: "storage_unavailable" };
  }
  if (!mdi.value?.mdiCaseId) {
    return { ok: false, code: "payment_not_ready" };
  }

  const mirror = await input.repository.getMdiCaseStatusMirror(mdi.value.mdiCaseId);
  if (!mirror.ok) {
    return { ok: false, code: "storage_unavailable" };
  }
  if (mirror.value && isClinicallyClosedStatus(mirror.value.caseStatus)) {
    return { ok: false, code: "clinical_declined" };
  }

  const stripeLinkage = await input.repository.getStripeLinkage(input.cognitoSub);
  if (!stripeLinkage.ok) {
    return { ok: false, code: "storage_unavailable" };
  }
  if (
    stripeLinkage.value?.billingStatus === "active" ||
    stripeLinkage.value?.billingStatus === "past_due" ||
    stripeLinkage.value?.billingStatus === "cancel_pending"
  ) {
    return { ok: false, code: "active_billing_exists" };
  }
  if (stripeLinkage.value?.billingStatus === "canceled") {
    return { ok: false, code: "billing_closed" };
  }
  if (stripeLinkage.value?.billingStatus === "payment_method_collected") {
    return {
      ok: true,
      status: "payment_method_already_collected",
      billingStatus: "payment_method_collected",
      stripeCustomerId: stripeLinkage.value.stripeCustomerId,
    };
  }

  const metadata = stripeMetadataForPatient({
    cognitoSub: input.cognitoSub,
    mdiCaseId: mdi.value.mdiCaseId,
    mdiPatientId: mdi.value.mdiPatientId,
    stage: input.stage,
  });
  const customerId = stripeLinkage.value?.stripeCustomerId ?? await createStripeCustomer({
    metadata,
    stage: input.stage,
    stripe: input.stripe,
  });
  if (!customerId) {
    return { ok: false, code: "stripe_unavailable" };
  }

  const linked = await input.repository.linkStripeCustomer({
    allowedCurrentBillingStatuses: ["not_started", "payment_method_pending"],
    billingStatus: "payment_method_pending",
    cognitoSub: input.cognitoSub,
    now: input.now,
    stripeCustomerId: customerId,
  });
  if (!linked.ok) {
    return { ok: false, code: "storage_unavailable" };
  }

  const checkoutParams = createPaymentMethodSetupCheckoutParams({
    cancelUrl: input.urls.cancelUrl,
    customerId,
    metadata,
    successUrl: input.urls.successUrl,
  });
  if (!checkoutParams.ok) {
    return { ok: false, code: "invalid_stripe_metadata" };
  }

  let session: Awaited<ReturnType<PaymentMethodStripeClient["checkout"]["sessions"]["create"]>>;
  try {
    session = await input.stripe.checkout.sessions.create(
      checkoutParams.value,
      { idempotencyKey: idempotencyKey("checkout-setup", input.stage, input.cognitoSub) },
    );
  } catch {
    return { ok: false, code: "stripe_unavailable" };
  }

  if (!session.url) {
    return { ok: false, code: "stripe_unavailable" };
  }

  return {
    ok: true,
    status: "checkout_session_created",
    billingStatus: "payment_method_pending",
    checkoutSessionId: session.id,
    checkoutUrl: session.url,
    stripeCustomerId: customerId,
  };
}

function canCollectPaymentMethodForProfile(
  status: PatientProfileRecord["onboardingStatus"],
) {
  return status === "mdi_submitted" ||
    status === "clinical_review" ||
    status === "billing_ready";
}

function isClinicallyClosedStatus(
  status: MdiCaseStatusMirrorRecord["caseStatus"],
) {
  return status === "cancelled" || status === "declined";
}

async function createStripeCustomer(input: {
  metadata: Record<string, string>;
  stage: PaymentMethodStage;
  stripe: PaymentMethodStripeClient;
}) {
  const customerParams = createStripeCustomerParams({
    apothStage: input.stage,
    appPatientId: input.metadata.app_patient_id,
    cognitoSub: input.metadata.cognito_sub,
    description: "Apoth account",
    mdiCaseId: input.metadata.mdi_case_id,
    mdiPatientId: input.metadata.mdi_patient_id,
  });
  if (!customerParams.ok) {
    return null;
  }

  try {
    const customer = await input.stripe.customers.create(
      customerParams.value,
      { idempotencyKey: idempotencyKey("customer", input.stage, input.metadata.cognito_sub ?? "") },
    );
    return customer.id;
  } catch {
    return null;
  }
}

function stripeMetadataForPatient(input: {
  cognitoSub: string;
  mdiCaseId: string;
  mdiPatientId: string;
  stage: PaymentMethodStage;
}) {
  return {
    app_patient_id: `app_patient_${stableDigest(input.cognitoSub).slice(0, 24)}`,
    apoth_stage: input.stage,
    cognito_sub: input.cognitoSub,
    mdi_case_id: input.mdiCaseId,
    mdi_patient_id: input.mdiPatientId,
  };
}

function idempotencyKey(kind: string, stage: string, subject: string) {
  return `apoth:${stage}:${kind}:${stableDigest(subject)}`;
}

function stableDigest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function appDataErr(message: string): AppDataResult<never> {
  return {
    ok: false,
    error: { kind: "validation_failed", message },
  };
}
