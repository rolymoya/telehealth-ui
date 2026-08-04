import { ProductRouteState } from "@/components/product/ProductRouteState";
import { onboardingHref } from "@/lib/public-commerce";

export default function NotFound() {
  return (
    <ProductRouteState
      eyebrow="Apoth"
      tone="not-found"
      title="We could not find that page."
      body="The link may have changed, or the page may no longer be available. No account or care information was changed."
      actions={[
        { href: "/", label: "Go home" },
        { href: onboardingHref("weight"), label: "Start a visit", variant: "secondary" },
      ]}
    />
  );
}
