import { ProductRouteState } from "@/components/product/ProductRouteState";

export default function Loading() {
  return (
    <ProductRouteState
      eyebrow="Apoth"
      tone="loading"
      title="Preparing your next step."
      body="We are loading the page without changing account, billing, or care information."
    />
  );
}
