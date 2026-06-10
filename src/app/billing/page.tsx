import type { Metadata } from "next";
import { ProductPlaceholder } from "@/components/product/ProductPlaceholder";

export const metadata: Metadata = {
  title: "Billing · Apoth",
  description: "Manage Apoth billing workflow status.",
};

export default function BillingPage() {
  return (
    <ProductPlaceholder
      eyebrow="Billing"
      title="Billing"
      body="Complete billing setup when your account reaches the billing step."
    />
  );
}
