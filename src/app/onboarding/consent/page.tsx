import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import { ConsentAcceptanceClient } from "@/app/onboarding/consent/ConsentAcceptanceClient";

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
          <div className="max-w-3xl">
            <p className="text-eyebrow uppercase text-ash">Onboarding</p>
            <h1 className="display-serif mt-4 text-display-md font-light text-balance">
              Review required consents.
            </h1>
            <p className="mt-5 text-pretty text-[1.0625rem] text-ink/75">
              Apoth is a technology platform. Independent clinicians and MD
              Integrations handle medical care. Review each current document
              before continuing to intake.
            </p>
          </div>

          <ConsentAcceptanceClient />
        </section>
      </main>
      <Footer />
    </>
  );
}
