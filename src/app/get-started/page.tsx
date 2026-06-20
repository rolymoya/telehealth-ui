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
        <section className="mx-auto grid max-w-page gap-10 px-6 py-16 text-ink md:grid-cols-[0.9fr_1fr] md:px-10 md:py-24">
          <div className="max-w-3xl">
            <p className="text-eyebrow uppercase text-ash">Start a visit</p>
            <h1 className="display-serif mt-4 text-display-md font-light text-balance">
              Start with a secure account.
            </h1>
            <p className="mt-5 text-pretty text-[1.0625rem] text-ink/75">
              Create an Apoth account first so your visit can resume safely if
              you step away. Clinical intake happens after account setup.
            </p>
            <div className="mt-8 flex flex-wrap gap-4 text-[0.95rem] font-medium text-clay-deep">
              <Link className="hover:text-clay" href="/#what-we-treat">
                See what we treat
              </Link>
              <Link className="hover:text-clay" href="/#how-it-works">
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
