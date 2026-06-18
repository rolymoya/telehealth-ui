import { ProductRouteState } from "@/components/product/ProductRouteState";

export default function BillingLoading() {
  return (
    <ProductRouteState
      eyebrow="Billing"
      tone="loading"
      title="Preparing billing."
      body="We are loading billing status. No payment method is collected while this screen is shown."
    />
  );
}
