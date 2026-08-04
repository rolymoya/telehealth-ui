import type { Metadata } from "next";
import { PortalLaunch } from "@/patient/commerce/PortalLaunch";

export const metadata: Metadata = {
  title: "Secure clinical intake · Apoth",
  description: "Continue to the independent provider's secure patient portal.",
};

export default function PortalLaunchPage() {
  return <PortalLaunch />;
}
