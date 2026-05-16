import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "Start a visit · Apoth",
  description:
    "Begin your intake with Apoth. Connect with a US-licensed clinician to see if treatment is appropriate for you.",
};

export default function GetStartedPage() {
  return (
    <>
      <Nav variant="light" />
      <main
        id="main"
        className="mx-auto max-w-page px-6 pb-24 pt-16 text-ink md:px-10 md:pb-32 md:pt-20"
      >
        <p className="text-eyebrow uppercase text-ash">Start a visit</p>
        <h1 className="display-serif mt-5 text-display-lg font-light text-balance">
          Connect with a licensed clinician.
        </h1>
        <p className="mt-6 max-w-measure text-pretty text-ink/75">
          Our intake is being built. In the meantime, choose the category that
          fits and we will route you to the right starting point. Eligibility is
          determined clinically — we will not charge a card before confirming we
          can see you in your state.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/#what-we-treat"
            className="rounded-full bg-clay-deep px-5 py-2.5 text-[0.95rem] font-medium text-cream transition-all duration-250 ease-out-quart hover:bg-clay"
          >
            See what we treat
          </Link>
          <Link
            href="/#how-it-works"
            className="rounded-full border border-ash-line px-5 py-2.5 text-[0.95rem] font-medium text-ink transition-all duration-250 ease-out-quart hover:border-clay-deep hover:text-clay-deep"
          >
            How a visit goes
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
