import type { Metadata } from "next";
import { ProductPlaceholder } from "@/components/product/ProductPlaceholder";

export const metadata: Metadata = {
  title: "Account · Apoth",
  description: "Manage your Apoth account settings.",
};

export default function AccountPage() {
  return (
    <ProductPlaceholder
      eyebrow="Patient account"
      title="Account"
      body="Manage basic account settings for the Apoth technology platform."
    />
  );
}
