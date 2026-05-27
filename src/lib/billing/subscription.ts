// Implemented in T-024/T-025: Stripe subscription lifecycle
export type CaseStatus = "pending" | "in_review" | "completed" | "rejected";

export interface SubscriptionActivationInput {
  userId: string;
  caseStatus: CaseStatus;
}

export interface SubscriptionActivationResult {
  allowed: boolean;
  reason?: string;
}

export async function canActivateSubscription(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _input: SubscriptionActivationInput,
): Promise<SubscriptionActivationResult> {
  throw new Error("not implemented — T-024");
}
