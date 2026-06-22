import type { Metadata } from "next";
import { BillingSetupClient } from "./BillingSetupClient";

export const metadata: Metadata = {
  title: "Billing · Apoth",
  description: "Manage Apoth billing workflow status.",
};

export default function BillingPage() {
  return <BillingSetupClient />;
}
