"use client";

import { BillingUnavailableState } from "@/components/product/ProviderUnavailableStates";

export default function BillingError({
  error: _error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <BillingUnavailableState onRetry={reset} />;
}
