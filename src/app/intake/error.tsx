"use client";

import { ProductRouteState } from "@/components/product/ProductRouteState";

export default function IntakeError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ProductRouteState
      eyebrow="Onboarding"
      tone="route-error"
      title="We could not open intake."
      body="No questionnaire answers were saved by Apoth from this page. Try again, or return to the intake start when you are ready."
      actions={[
        { label: "Try again", onClick: reset },
        { href: "/intake", label: "Intake start", variant: "secondary" },
      ]}
    />
  );
}
