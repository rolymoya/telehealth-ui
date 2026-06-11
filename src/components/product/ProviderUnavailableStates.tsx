import { ProductRouteState } from "@/components/product/ProductRouteState";

export function MdiUnavailableState({
  handoffComplete = false,
  onRetry,
}: {
  handoffComplete?: boolean;
  onRetry?: () => void;
}) {
  return (
    <ProductRouteState
      eyebrow="Onboarding"
      tone="mdi"
      title="The care workflow is temporarily unavailable."
      body={handoffComplete
        ? "Apoth could not reopen the MDI-backed workflow right now. If your answers were already handed off to MDI, Apoth does not keep questionnaire answers on this page."
        : "Apoth could not open the MDI-backed workflow right now. Medical questionnaire answers are collected in MDI as the clinical system of record, not stored on this Apoth page."}
      actions={[
        onRetry
          ? { label: "Try again", onClick: onRetry }
          : { href: "/onboarding/mdi", label: "Try again" },
        { href: "/dashboard", label: "Dashboard", variant: "secondary" },
      ]}
    />
  );
}

export function BillingUnavailableState({
  onRetry,
}: {
  onRetry?: () => void;
}) {
  return (
    <ProductRouteState
      eyebrow="Billing"
      tone="billing"
      title="Billing setup is not available yet."
      body="Billing setup is temporarily unavailable while this launch workflow is being connected. No payment method is collected or changed on this page."
      actions={[
        onRetry
          ? { label: "Try again", onClick: onRetry }
          : { href: "/dashboard", label: "Dashboard" },
        { href: "/intake", label: "Intake", variant: "secondary" },
      ]}
    />
  );
}

export function ProductMaintenanceState() {
  return (
    <ProductRouteState
      eyebrow="Patient account"
      tone="maintenance"
      title="This workflow is temporarily unavailable."
      body="The Apoth product workflow is being updated. No account, billing, or care information was changed by this page."
      actions={[
        { href: "/dashboard", label: "Dashboard" },
        { href: "/", label: "Home", variant: "secondary" },
      ]}
    />
  );
}
