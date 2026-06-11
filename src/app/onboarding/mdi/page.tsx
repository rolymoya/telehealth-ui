import type { Metadata } from "next";
import { MdiUnavailableState } from "@/components/product/ProviderUnavailableStates";

export const metadata: Metadata = {
  title: "Care workflow · Apoth",
  description: "Continue the MDI-backed care workflow connection.",
};

export default function MdiHandoffPage() {
  return <MdiUnavailableState />;
}
