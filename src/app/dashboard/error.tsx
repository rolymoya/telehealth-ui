"use client";

import { ProductRouteState } from "@/components/product/ProductRouteState";

export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ProductRouteState
      eyebrow="Patient account"
      tone="route-error"
      title="We could not refresh your dashboard."
      body="The dashboard is temporarily unavailable. No account, billing, or care information was changed by this page."
      actions={[
        { label: "Try again", onClick: reset },
        { href: "/intake", label: "Intake", variant: "secondary" },
      ]}
    />
  );
}
