import type { Metadata } from "next";
import { BillingUnavailableState } from "@/components/product/ProviderUnavailableStates";

export const metadata: Metadata = {
  title: "Billing · Apoth",
  description: "Manage Apoth billing workflow status.",
};

export default function BillingPage() {
  return <BillingUnavailableState />;
}
