"use client";

import { ProductRouteState } from "@/components/product/ProductRouteState";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ProductRouteState
      eyebrow="Apoth"
      tone="route-error"
      title="This page needs a fresh start."
      body="Something interrupted the page, but no account or care information was changed here. Try again or return to a safe starting point."
      actions={[
        { label: "Try again", onClick: reset },
        { href: "/", label: "Go home", variant: "secondary" },
        { href: "/intake", label: "Start intake", variant: "secondary" },
      ]}
    />
  );
}
