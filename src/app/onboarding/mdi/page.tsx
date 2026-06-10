import type { Metadata } from "next";
import { ProductPlaceholder } from "@/components/product/ProductPlaceholder";

export const metadata: Metadata = {
  title: "Care workflow · Apoth",
  description: "Continue the MDI-backed care workflow connection.",
};

export default function MdiHandoffPage() {
  return (
    <ProductPlaceholder
      eyebrow="Onboarding"
      title="Care workflow"
      body="Continue after Apoth links your account to the MDI-backed workflow."
    />
  );
}
