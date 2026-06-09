import type { Metadata } from "next";
import { ProductPlaceholder } from "@/components/product/ProductPlaceholder";
import { requireProtectedPageAccess } from "@/lib/protected-page";

export const metadata: Metadata = {
  title: "Billing · Apoth",
  description: "Manage Apoth billing workflow status.",
};

export default async function BillingPage() {
  await requireProtectedPageAccess({ pathname: "/billing" });

  return (
    <ProductPlaceholder
      eyebrow="Billing"
      title="Billing"
      body="Complete billing setup when your account reaches the billing step."
    />
  );
}
