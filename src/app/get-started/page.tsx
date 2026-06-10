import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { resolveOnboardingStartRedirect } from "@/lib/onboarding-start";

export const metadata: Metadata = {
  title: "Start a visit · Apoth",
  description:
    "Begin your intake with Apoth. Connect with a US-licensed clinician to see if treatment is appropriate for you.",
};

export default async function GetStartedPage() {
  const start = await resolveOnboardingStartRedirect({
    pathname: "/get-started",
  });
  if (!start.ok) {
    throw new Error("Onboarding start could not be evaluated");
  }

  redirect(start.value.destination);
}
