import { ProductRouteState } from "@/components/product/ProductRouteState";

export default function AccountLoading() {
  return (
    <ProductRouteState
      eyebrow="Patient account"
      tone="loading"
      title="Preparing account settings."
      body="We are loading account settings without changing profile or care information."
    />
  );
}
