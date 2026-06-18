import { ProductRouteState } from "@/components/product/ProductRouteState";

export default function MdiLoading() {
  return (
    <ProductRouteState
      eyebrow="Onboarding"
      tone="loading"
      title="Opening the care workflow."
      body="We are preparing the MDI-backed step. Apoth does not store clinical questionnaire answers from this loading state."
    />
  );
}
