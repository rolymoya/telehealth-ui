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
  input: SubscriptionActivationInput,
): Promise<SubscriptionActivationResult> {
  if (input.caseStatus === "completed") {
    return { allowed: true };
  }
  return { allowed: false, reason: `case must be completed before subscription can activate (current: ${input.caseStatus})` };
}
