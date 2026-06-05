export const BILLING_UNLOCK_EVENT_TYPE = "case_clinically_approved";

export type MdiClinicalEvent = {
  provider: "mdi";
  type: string;
  mdiCaseId: string;
};

export type BillingState =
  | "payment_method_pending"
  | "payment_method_collected"
  | "subscription_active";

export function canActivateBilling(
  event: MdiClinicalEvent,
  billingState: BillingState,
): boolean {
  return (
    event.provider === "mdi" &&
    event.type === BILLING_UNLOCK_EVENT_TYPE &&
    billingState === "payment_method_collected"
  );
}
