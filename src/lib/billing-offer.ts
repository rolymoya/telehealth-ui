import { createHash } from "node:crypto";
import {
  billingOfferAcceptanceKey,
  createBillingOfferAcceptanceRecord,
  type AppDataRecord,
  type AppDataResult,
  type BillingOfferAcceptanceRecord,
} from "@/lib/dynamodb/app-data";

export type BillingOfferConfig = {
  authorizationVersion: `billing-offer-v${number}`;
  stripePriceId: string;
  unitAmountCents: number;
};

export type BillingOffer = BillingOfferConfig & {
  currency: "usd";
  interval: "month";
  mdiCaseId: string;
  offerId: string;
};

export type BillingOfferRepository = {
  get(key: ReturnType<typeof billingOfferAcceptanceKey>):
    | AppDataResult<AppDataRecord | null>
    | Promise<AppDataResult<AppDataRecord | null>>;
  put<T extends AppDataRecord>(record: T, options?: { ifNotExists?: boolean }):
    | AppDataResult<T>
    | Promise<AppDataResult<T>>;
  update<T extends AppDataRecord>(record: T, options?: { expected?: AppDataRecord }):
    | AppDataResult<T>
    | Promise<AppDataResult<T>>;
};

export function resolveBillingOfferConfig(
  env: Record<string, string | undefined>,
): { ok: true; value: BillingOfferConfig } | { ok: false } {
  const stripePriceId = (
    env.STRIPE_RECURRING_PRICE_ID ?? env.APOTH_STRIPE_PRICE_ID
  )?.trim() ?? "";
  const amount = Number(env.APOTH_BILLING_PRICE_CENTS);
  const authorizationVersion = env.APOTH_BILLING_AUTHORIZATION_VERSION?.trim() ||
    "billing-offer-v1";
  if (
    !/^price_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*$/.test(stripePriceId) ||
    !Number.isInteger(amount) ||
    amount <= 0 ||
    amount > 10_000_000 ||
    !/^billing-offer-v[1-9][0-9]*$/.test(authorizationVersion)
  ) {
    return { ok: false };
  }
  return {
    ok: true,
    value: {
      authorizationVersion: authorizationVersion as `billing-offer-v${number}`,
      stripePriceId,
      unitAmountCents: amount,
    },
  };
}

export function createBillingOffer(input: {
  config: BillingOfferConfig;
  mdiCaseId: string;
}): BillingOffer {
  return {
    ...input.config,
    currency: "usd",
    interval: "month",
    mdiCaseId: input.mdiCaseId,
    offerId: `offer_${digest([
      input.mdiCaseId,
      input.config.stripePriceId,
      input.config.unitAmountCents,
      input.config.authorizationVersion,
    ].join(":" )).slice(0, 48)}`,
  };
}

export async function acceptBillingOffer(
  repository: BillingOfferRepository,
  input: {
    cognitoSub: string;
    now: string;
    offer: BillingOffer;
  },
): Promise<AppDataResult<BillingOfferAcceptanceRecord>> {
  const existing = await repository.get(billingOfferAcceptanceKey(input.cognitoSub));
  if (!existing.ok) {
    return existing as AppDataResult<BillingOfferAcceptanceRecord>;
  }
  if (existing.value && existing.value.recordType !== "billingOfferAcceptance") {
    return appDataError("Billing offer key contains another record type");
  }
  if (existing.value?.offerId === input.offer.offerId) {
    return { ok: true, value: existing.value };
  }

  const candidate = createBillingOfferAcceptanceRecord({
    acceptedAt: input.now,
    authorizationVersion: input.offer.authorizationVersion,
    cognitoSub: input.cognitoSub,
    mdiCaseId: input.offer.mdiCaseId,
    now: input.now,
    offerId: input.offer.offerId,
    stripePriceId: input.offer.stripePriceId,
    unitAmountCents: input.offer.unitAmountCents,
  });
  if (!existing.value) {
    return repository.put(candidate, { ifNotExists: true });
  }
  return repository.update({
    ...candidate,
    createdAt: existing.value.createdAt,
  }, { expected: existing.value });
}

export async function billingOfferAcceptanceGate(
  repository: Pick<BillingOfferRepository, "get">,
  input: {
    cognitoSub: string;
    mdiCaseId: string;
    offerId: string;
    stripePriceId: string;
  },
): Promise<
  | { status: "accepted" }
  | { status: "acceptance_required" }
  | { status: "storage_unavailable" }
> {
  const result = await repository.get(billingOfferAcceptanceKey(input.cognitoSub));
  if (!result.ok) {
    return { status: "storage_unavailable" };
  }
  return result.value?.recordType === "billingOfferAcceptance" &&
      result.value.mdiCaseId === input.mdiCaseId &&
      result.value.offerId === input.offerId &&
      result.value.stripePriceId === input.stripePriceId
    ? { status: "accepted" }
    : { status: "acceptance_required" };
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function appDataError(message: string): AppDataResult<never> {
  return { ok: false, error: { kind: "validation_failed", message } };
}
