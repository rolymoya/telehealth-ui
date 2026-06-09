import type { Metadata } from "next";
import { ProductPlaceholder } from "@/components/product/ProductPlaceholder";
import { requireProtectedPageAccess } from "@/lib/protected-page";

export const metadata: Metadata = {
  title: "Consent · Apoth",
  description: "Review required Apoth onboarding consents.",
};

export default async function ConsentPage() {
  await requireProtectedPageAccess({ pathname: "/onboarding/consent" });

  return (
    <ProductPlaceholder
      eyebrow="Onboarding"
      title="Consent"
      body="Review required platform consents before continuing to intake."
    />
  );
}
