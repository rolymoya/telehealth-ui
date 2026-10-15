import { ProductRouteState } from "@/components/product/ProductRouteState";
import { weightOffer } from "@/lib/product-availability";

export default function NotFound() {
  const offer = weightOffer();

  return (
    <ProductRouteState
      eyebrow="Apoth"
      tone="not-found"
      title="We could not find that page."
      body="The link may have changed, or the page may no longer be available. No account or care information was changed."
      actions={[
        { href: "/", label: "Go home" },
        { href: offer.href, label: offer.ctaLabel, variant: "secondary" },
      ]}
    />
  );
}
