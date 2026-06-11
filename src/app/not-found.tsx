import { ProductRouteState } from "@/components/product/ProductRouteState";

export default function NotFound() {
  return (
    <ProductRouteState
      eyebrow="Apoth"
      tone="not-found"
      title="We could not find that page."
      body="The link may have changed, or the page may no longer be available. No account or care information was changed."
      actions={[
        { href: "/", label: "Go home" },
        { href: "/intake", label: "Start intake", variant: "secondary" },
      ]}
    />
  );
}
