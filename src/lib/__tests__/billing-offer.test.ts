import { describe, expect, it } from "vitest";
import { createInMemoryAppDataRepository } from "@/lib/dynamodb/app-data";
import {
  acceptBillingOffer,
  billingOfferAcceptanceGate,
  createBillingOffer,
  resolveBillingOfferConfig,
} from "@/lib/billing-offer";

const cognitoSub = "cognito-sub-0123456789abcdef";
const mdiCaseId = "mdi_case_offer_001";
const now = "2026-08-04T18:00:00.000Z";
const config = {
  authorizationVersion: "billing-offer-v1" as const,
  stripePriceId: "price_weight_199_monthly",
  unitAmountCents: 19_900,
};

describe("billing offer acceptance", () => {
  it("fails closed unless the exact recurring amount and immutable Stripe price are configured", () => {
    expect(resolveBillingOfferConfig({})).toEqual({ ok: false });
    expect(resolveBillingOfferConfig({
      APOTH_BILLING_PRICE_CENTS: "19900",
      APOTH_STRIPE_PRICE_ID: "price_weight_199_monthly",
    })).toEqual({ ok: true, value: config });
  });

  it("records separate recurring authorization without clinical content", async () => {
    const repository = createInMemoryAppDataRepository();
    const offer = createBillingOffer({ config, mdiCaseId });

    await expect(acceptBillingOffer(repository, {
      cognitoSub,
      now,
      offer,
    })).resolves.toMatchObject({ ok: true, value: { offerId: offer.offerId } });

    const gate = await billingOfferAcceptanceGate(repository, {
      cognitoSub,
      mdiCaseId,
      offerId: offer.offerId,
      stripePriceId: config.stripePriceId,
    });
    expect(gate).toEqual({ status: "accepted" });
    expect(JSON.stringify(repository)).not.toMatch(
      /answer|diagnosis|symptom|medication|questionnaire|clinicalNotes/i,
    );
  });

  it("does not authorize a different case or price", async () => {
    const repository = createInMemoryAppDataRepository();
    await acceptBillingOffer(repository, {
      cognitoSub,
      now,
      offer: createBillingOffer({ config, mdiCaseId }),
    });

    await expect(billingOfferAcceptanceGate(repository, {
      cognitoSub,
      mdiCaseId: "mdi_case_offer_002",
      offerId: createBillingOffer({ config, mdiCaseId: "mdi_case_offer_002" }).offerId,
      stripePriceId: config.stripePriceId,
    })).resolves.toEqual({ status: "acceptance_required" });
    await expect(billingOfferAcceptanceGate(repository, {
      cognitoSub,
      mdiCaseId,
      offerId: createBillingOffer({
        config: { ...config, stripePriceId: "price_weight_099_monthly" },
        mdiCaseId,
      }).offerId,
      stripePriceId: "price_weight_099_monthly",
    })).resolves.toEqual({ status: "acceptance_required" });

    await expect(billingOfferAcceptanceGate(repository, {
      cognitoSub,
      mdiCaseId,
      offerId: createBillingOffer({
        config: { ...config, unitAmountCents: 9_900 },
        mdiCaseId,
      }).offerId,
      stripePriceId: config.stripePriceId,
    })).resolves.toEqual({ status: "acceptance_required" });
  });
});
