import type { Metadata } from "next";
import { PortalLaunch, type PortalLaunchError } from "@/patient/commerce/PortalLaunch";

export const metadata: Metadata = {
  title: "Secure clinical intake · Apoth",
  description: "Continue to the independent provider's secure patient portal.",
};

const portalErrors = new Set<PortalLaunchError>([
  "authentication_required",
  "portal_busy",
  "portal_not_authorized",
  "portal_unavailable",
]);

export default async function PortalLaunchPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const value = (await searchParams).error;
  const candidate = Array.isArray(value) ? value[0] : value;
  const error = candidate && portalErrors.has(candidate as PortalLaunchError)
    ? candidate as PortalLaunchError
    : undefined;

  return <PortalLaunch error={error} />;
}
