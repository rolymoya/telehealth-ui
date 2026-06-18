import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import { IntakePrecheckClient } from "./IntakePrecheckClient";

export const metadata: Metadata = {
  title: "Intake · Apoth",
  description: "Start the Apoth intake handoff workflow.",
};

export default function IntakePage() {
  return (
    <>
      <Nav variant="light" />
      <main id="main" className="text-ink">
        <section className="mx-auto grid max-w-page gap-10 px-6 py-16 md:grid-cols-[0.85fr_1.15fr] md:px-10 md:py-24">
          <div className="max-w-prose">
            <p className="text-eyebrow uppercase text-ash">Onboarding</p>
            <h1 className="display-serif mt-4 text-display-md font-light text-balance">
              Confirm the basics before clinical intake.
            </h1>
            <p className="mt-5 text-pretty text-[1.0625rem] text-ink/75">
              Apoth uses this step to route your intake to clinicians and
              pharmacy partners appropriately. Medical questionnaire answers
              are collected later and sent to MD Integrations as the clinical
              system of record.
            </p>
            <p className="mt-6 text-[1rem] text-ink/65">
              This is not a clinical decision. A licensed clinician decides
              whether care is appropriate after reviewing your MDI intake.
            </p>
          </div>
          <IntakePrecheckClient />
        </section>
      </main>
      <Footer />
    </>
  );
}
