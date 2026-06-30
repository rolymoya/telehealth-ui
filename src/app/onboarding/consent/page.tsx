import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import { ConsentAcceptanceClient } from "@/app/onboarding/consent/ConsentAcceptanceClient";
import {
  resolveConsentDocumentsForDisplay,
  type ConsentAcceptanceGate,
} from "@/lib/consent-acceptance";
import { requiredConsentsBeforeMdi } from "@/lib/consents";

export const metadata: Metadata = {
  title: "Consent · Apoth",
  description: "Review required Apoth onboarding consents.",
};

type ConsentPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>> |
    Record<string, string | string[] | undefined>;
};

export default async function ConsentPage({ searchParams }: ConsentPageProps = {}) {
  const gate = consentGateFromSearchParams(await searchParams);
  const display = await resolveConsentDocumentsForDisplay({ gate });
  const requiredConsents = display.ok
    ? display.value.requiredConsents
    : gate === "pre_mdi"
      ? requiredConsentsBeforeMdi()
      : [];
  const copy = consentPageCopy(gate);

  return (
    <>
      <Nav variant="light" />
      <main id="main">
        <section className="mx-auto max-w-page px-6 py-16 text-ink md:px-10 md:py-24">
          <div className="max-w-3xl">
            <p className="text-eyebrow uppercase text-ash">Onboarding</p>
            <h1 className="display-serif mt-4 text-display-md font-light text-balance">
              {copy.heading}
            </h1>
            <p className="mt-5 text-pretty text-[1.0625rem] text-ink/75">
              {copy.body}
            </p>
          </div>

          <ConsentAcceptanceClient
            emptyMedicationGate={gate === "post_questionnaire_medication" && requiredConsents.length === 0}
            gate={gate}
            requiredConsents={requiredConsents}
          />
        </section>
      </main>
      <Footer />
    </>
  );
}

function consentGateFromSearchParams(
  params: Record<string, string | string[] | undefined> | undefined,
): ConsentAcceptanceGate {
  return paramValue(params?.gate) === "medication"
    ? "post_questionnaire_medication"
    : "pre_mdi";
}

function paramValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function consentPageCopy(gate: ConsentAcceptanceGate) {
  return gate === "post_questionnaire_medication"
    ? {
        heading: "Review medication disclosure.",
        body: "If your treatment path includes a medication-specific disclosure, Apoth asks for it after your MDI questionnaire is submitted and before billing or prescribing can continue.",
      }
    : {
        heading: "Review telehealth and platform terms.",
        body: "You have already acknowledged the privacy notice. Review telehealth consent and Apoth platform terms before the MDI questionnaire opens.",
      };
}
