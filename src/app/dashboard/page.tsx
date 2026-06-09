import type { Metadata } from "next";
import { ProductPlaceholder } from "@/components/product/ProductPlaceholder";
import { requireProtectedPageAccess } from "@/lib/protected-page";

export const metadata: Metadata = {
  title: "Dashboard · Apoth",
  description: "View your Apoth account workflow status.",
};

export default async function DashboardPage() {
  await requireProtectedPageAccess({ pathname: "/dashboard" });

  return (
    <ProductPlaceholder
      eyebrow="Patient account"
      title="Dashboard"
      body="Review account workflow status after required onboarding steps are complete."
    />
  );
}
