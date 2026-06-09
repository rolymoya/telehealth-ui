import type { Metadata } from "next";
import { ProductPlaceholder } from "@/components/product/ProductPlaceholder";
import { requireProtectedPageAccess } from "@/lib/protected-page";

export const metadata: Metadata = {
  title: "Intake · Apoth",
  description: "Start the Apoth intake handoff workflow.",
};

export default async function IntakePage() {
  await requireProtectedPageAccess({ pathname: "/intake" });

  return (
    <ProductPlaceholder
      eyebrow="Onboarding"
      title="Intake"
      body="Start the intake workflow that submits responses to the clinical system of record."
    />
  );
}
