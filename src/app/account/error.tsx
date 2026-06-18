"use client";

import { ProductRouteState } from "@/components/product/ProductRouteState";

export default function AccountError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ProductRouteState
      eyebrow="Patient account"
      tone="route-error"
      title="We could not open account settings."
      body="Account settings are temporarily unavailable. No profile or care information was changed on this page."
      actions={[
        { label: "Try again", onClick: reset },
        { href: "/dashboard", label: "Dashboard", variant: "secondary" },
      ]}
    />
  );
}
