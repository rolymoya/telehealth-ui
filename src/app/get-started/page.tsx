import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import { GetStartedStartClient } from "@/app/get-started/GetStartedStartClient";

export const metadata: Metadata = {
  title: "Start a visit · Apoth",
  description:
    "Begin your intake with Apoth. Connect with a US-licensed clinician to see if treatment is appropriate for you.",
};

export default function GetStartedPage() {
  return (
    <>
      <Nav variant="light" />
      <main id="main">
        <section className="mx-auto grid max-w-[1120px] gap-5 px-5 py-10 text-ink md:grid-cols-[0.86fr_1fr] md:px-8 md:py-20">
          <div className="max-w-3xl rounded-[26px] bg-[#f5df75] p-7 shadow-soft sm:p-10">
            <p className="text-eyebrow uppercase text-black/55">Start a visit</p>
            <h1 className="display-serif mt-4 text-display-md font-light text-balance">
              Start with the privacy notice.
            </h1>
            <p className="mt-5 text-pretty text-[1.0625rem] text-ink/75">
              Review the privacy notice, answer a short precheck, then create
              or sign in to your account if online intake is a fit. Clinical
              questionnaire answers come later through MD Integrations.
            </p>
            <div className="mt-8 flex flex-wrap gap-4 text-[0.95rem] font-semibold text-[#171719]">
              <Link className="underline decoration-black/25 underline-offset-4 hover:decoration-black" href="/weight-loss">
                Explore weight loss
              </Link>
              <Link className="underline decoration-black/25 underline-offset-4 hover:decoration-black" href="/weight-loss#how-it-works">
                How a visit goes
              </Link>
            </div>
          </div>
          <div>
            <GetStartedStartClient />
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
