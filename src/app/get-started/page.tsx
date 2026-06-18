import Link from "next/link";
import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import { GetStartedRedirectClient } from "@/app/get-started/GetStartedRedirectClient";

export const metadata: Metadata = {
  title: "Start a visit · Apoth",
  description:
    "Begin your intake with Apoth. Connect with a US-licensed clinician to see if treatment is appropriate for you.",
};

export default function GetStartedPage() {
  return (
    <>
      <GetStartedRedirectClient />
      <Nav variant="light" />
      <main id="main">
        <section className="mx-auto max-w-page px-6 py-16 text-ink md:px-10 md:py-24">
          <div className="max-w-3xl">
            <p className="text-eyebrow uppercase text-ash">Start a visit</p>
            <h1 className="display-serif mt-4 text-display-md font-light text-balance">
              Continue to intake.
            </h1>
            <p className="mt-5 text-pretty text-[1.0625rem] text-ink/75">
              Apoth will start with a residency and eligibility step before any
              MDI-backed clinical questionnaire.
            </p>
            <Link
              className="mt-8 inline-flex rounded-full bg-clay-deep px-6 py-3 text-[1rem] font-medium text-cream transition-colors hover:bg-clay"
              href="/intake"
            >
              Continue
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
