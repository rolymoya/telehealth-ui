import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import { BillingOfferClient } from "./BillingOfferClient";

export const metadata: Metadata = {
  title: "Approved plan · Apoth",
  description: "Review and authorize the exact recurring price for an approved plan.",
};

export default function BillingOfferPage() {
  return <><Nav variant="light" /><BillingOfferClient /><Footer /></>;
}
