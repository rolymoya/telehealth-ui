import { ProductRouteState } from "@/components/product/ProductRouteState";

export default function DashboardLoading() {
  return (
    <ProductRouteState
      eyebrow="Patient account"
      tone="loading"
      title="Preparing your dashboard."
      body="We are loading your account workflow status."
    />
  );
}
