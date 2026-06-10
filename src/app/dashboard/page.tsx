import type { Metadata } from "next";
import { ProductPlaceholder } from "@/components/product/ProductPlaceholder";

export const metadata: Metadata = {
  title: "Dashboard · Apoth",
  description: "View your Apoth account workflow status.",
};

export default function DashboardPage() {
  return (
    <ProductPlaceholder
      eyebrow="Patient account"
      title="Dashboard"
      body="Review account workflow status after required onboarding steps are complete."
    />
  );
}
