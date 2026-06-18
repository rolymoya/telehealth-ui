import { ProductRouteState } from "@/components/product/ProductRouteState";

export default function IntakeLoading() {
  return (
    <ProductRouteState
      eyebrow="Onboarding"
      tone="loading"
      title="Preparing intake."
      body="We are confirming the next intake step. Medical questionnaire answers are not collected on this loading screen."
    />
  );
}
