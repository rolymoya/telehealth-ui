import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import { ConsentAcceptanceClient } from "@/app/onboarding/consent/ConsentAcceptanceClient";
import {
  requiredConsentsBeforeMdi,
  requiredMedicationDisclosureConsents,
} from "@/lib/consents";

export const metadata: Metadata = {
  title: "Consent · Apoth",
  description: "Review required Apoth onboarding consents.",
};

export default function ConsentPage() {
  return (
    <>
      <Nav variant="light" />
      <main id="main">
        <section className="mx-auto max-w-page px-6 py-16 text-ink md:px-10 md:py-24">
          <ConsentAcceptanceClient
            medicationConsents={requiredMedicationDisclosureConsents({
              treatment: "weight",
            })}
            preMdiConsents={requiredConsentsBeforeMdi()}
          />
        </section>
      </main>
      <Footer />
    </>
  );
}
