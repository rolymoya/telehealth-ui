"use client";

import { MdiUnavailableState } from "@/components/product/ProviderUnavailableStates";

export default function MdiError({
  error: _error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <MdiUnavailableState handoffComplete onRetry={reset} />;
}
