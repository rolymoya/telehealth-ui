import type { Metadata } from "next";
import { ProductPlaceholder } from "@/components/product/ProductPlaceholder";
import { requireProtectedPageAccess } from "@/lib/protected-page";

export const metadata: Metadata = {
  title: "Account · Apoth",
  description: "Manage your Apoth account settings.",
};

export default async function AccountPage() {
  await requireProtectedPageAccess({ pathname: "/account" });

  return (
    <ProductPlaceholder
      eyebrow="Patient account"
      title="Account"
      body="Manage basic account settings for the Apoth technology platform."
    />
  );
}
