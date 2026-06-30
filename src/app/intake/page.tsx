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
              Privacy notice, then a short precheck.
            </h1>
            <p className="mt-5 text-pretty text-[1.0625rem] text-ink/75">
              Start by acknowledging the privacy notice, then answer a few
              basics so Apoth can route you before account setup. Medical
              questionnaire answers are collected later by MD Integrations.
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
