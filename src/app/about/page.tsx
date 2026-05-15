import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { usStates } from "@/lib/data";

export const metadata: Metadata = {
  title: "About · Apothem",
  description:
    "Apothem is a telehealth platform that connects patients with independent US-licensed clinicians and a licensed compounding pharmacy partner. Available in all 50 states.",
};

export default function AboutPage() {
  return (
    <>
      <Nav variant="light" />
      <main id="main" className="text-ink">
        <section className="border-b border-ash-line bg-cream py-20 md:py-28">
          <div className="mx-auto max-w-page px-6 md:px-10">
            <p className="text-eyebrow uppercase text-ash">About</p>
            <h1 className="display-serif mt-5 text-display-lg font-light text-balance">
              A small, considered way to get care for the things people quietly
              look up at night.
            </h1>
            <p className="mt-7 max-w-measure text-pretty text-[1.075rem] leading-[1.6] text-ink/80 md:text-[1.15rem]">
              Apothem is a telehealth platform. We connect adults with
              US-licensed clinicians for sexual health, hair, weight, and
              physician-supervised peptide care, and we coordinate with a
              licensed pharmacy partner that fills the prescriptions. We do not
              practice medicine. We do not dispense medication. We are the
              software, the patient experience, and the connective tissue
              between you, your clinician, and your pharmacy.
            </p>
          </div>
        </section>

        <section className="bg-cream-warm py-20 md:py-28">
          <div className="mx-auto grid max-w-page grid-cols-1 gap-y-12 px-6 md:px-10 lg:grid-cols-12 lg:gap-x-12">
            <header className="lg:col-span-5">
              <p className="text-eyebrow uppercase text-ash">How we are structured</p>
              <h2 className="display-serif mt-5 text-display-md font-light text-balance">
                Three legal entities, three jobs, kept separate on purpose.
              </h2>
              <p className="mt-6 max-w-prose text-pretty text-ink/75">
                Telehealth gets murky when the platform, the prescriber, and
                the pharmacy are pretending to be one company. We keep them
                separate, in writing, because the regulators we operate under
                require it and because it is the honest way to describe what
                actually happens when you start care.
              </p>
            </header>

            <dl className="lg:col-span-7">
              <div className="border-t border-ash-line py-7">
                <dt className="flex items-baseline justify-between gap-4">
                  <p className="display-serif text-2xl font-light text-ink">
                    Apothem Health PBC
                  </p>
                  <p className="font-mono text-[0.72rem] uppercase tracking-eyebrow text-ash">
                    Platform
                  </p>
                </dt>
                <dd className="mt-3 max-w-prose text-pretty text-ink/80">
                  A Delaware public benefit corporation. Apothem Health PBC
                  operates this website, the patient app, customer support,
                  scheduling, and the technology that makes the visit happen.
                  Apothem Health PBC is not a medical provider, does not
                  practice medicine, and does not make clinical decisions about
                  your care.
                </dd>
              </div>

              <div className="border-t border-ash-line py-7">
                <dt className="flex items-baseline justify-between gap-4">
                  <p className="display-serif text-2xl font-light text-ink">
                    Apothem Medical PA
                  </p>
                  <p className="font-mono text-[0.72rem] uppercase tracking-eyebrow text-ash">
                    Physician group
                  </p>
                </dt>
                <dd className="mt-3 max-w-prose text-pretty text-ink/80">
                  An independent professional medical corporation, and any
                  affiliated state-specific professional entities required by
                  the state in which the clinician is licensed. Every clinical
                  decision — including whether to prescribe, what to prescribe,
                  and how to follow up — is made by an independent clinician
                  licensed in your state. Apothem Health PBC does not influence
                  that decision. The clinician&apos;s name and state of
                  licensure are disclosed to you before your visit.
                </dd>
              </div>

              <div className="border-t border-b border-ash-line py-7">
                <dt className="flex items-baseline justify-between gap-4">
                  <p className="display-serif text-2xl font-light text-ink">
                    Licensed pharmacy partner
                  </p>
                  <p className="font-mono text-[0.72rem] uppercase tracking-eyebrow text-ash">
                    Pharmacy
                  </p>
                </dt>
                <dd className="mt-3 max-w-prose text-pretty text-ink/80">
                  Medication is dispensed by a licensed pharmacy partner that
                  is a separate legal entity from Apothem Health PBC and
                  Apothem Medical PA. Compounded medications — including
                  compounded semaglutide, compounded tirzepatide, BPC-157, and
                  retatrutide — are prepared by a licensed 503A compounding
                  pharmacy partner under a valid prescription from a clinician
                  licensed in your state. Compounded medications are not
                  FDA-approved.
                </dd>
                <p className="mt-3 max-w-prose text-pretty text-sm text-ash">
                  <span className="font-mono uppercase tracking-eyebrow text-[0.72rem] text-clay-deep">
                    TODO: pharmacy disclosure
                  </span>{" "}
                  · Pharmacy partner name, state of licensure, and NABP / state
                  pharmacy license numbers will be listed here when finalized.
                </p>
              </div>
            </dl>
          </div>
        </section>

        <section
          id="states"
          className="scroll-mt-24 border-t border-ash-line bg-cream py-20 md:py-28"
        >
          <div className="mx-auto max-w-page px-6 md:px-10">
            <header className="grid grid-cols-1 gap-y-6 lg:grid-cols-12 lg:gap-x-12">
              <p className="text-eyebrow uppercase text-ash lg:col-span-3">
                State availability
              </p>
              <div className="lg:col-span-9">
                <h2 className="display-serif text-display-md font-light text-balance">
                  All 50 states.
                </h2>
                <p className="mt-6 max-w-prose text-pretty text-ink/75">
                  Apothem coordinates care in every US state. Your prescription
                  is written by a clinician licensed in <em>your</em> state,
                  and your medication is dispensed by a licensed pharmacy
                  partner that ships to your state. If a regulatory or
                  licensure change ever affects availability in your state, we
                  will tell you before you finish intake and we will not
                  charge a card we cannot honor.
                </p>
              </div>
            </header>

            <ul className="mt-14 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-ash-line pt-8 text-sm sm:grid-cols-3 md:mt-16 md:grid-cols-4 md:text-[0.95rem] lg:grid-cols-5">
              {usStates.map((state) => (
                <li
                  key={state.code}
                  className="flex items-baseline gap-3 text-ink/85"
                >
                  <span className="font-mono text-[0.72rem] uppercase tracking-eyebrow text-ash">
                    {state.code}
                  </span>
                  <span>{state.name}</span>
                </li>
              ))}
            </ul>

            <p className="mt-10 max-w-prose text-pretty text-sm text-ash">
              Coverage reflects clinician licensure and pharmacy shipping
              eligibility at the time of writing. Eligibility is reconfirmed at
              intake.
            </p>
          </div>
        </section>

        <section
          id="contact"
          className="scroll-mt-24 border-t border-ash-line bg-sage-soft py-20 md:py-28"
        >
          <div className="mx-auto max-w-page px-6 md:px-10">
            <div className="grid grid-cols-1 gap-y-12 lg:grid-cols-12 lg:gap-x-12">
              <header className="lg:col-span-5">
                <p className="text-eyebrow uppercase text-sage-deep">
                  Contact
                </p>
                <h2 className="display-serif mt-5 text-display-md font-light text-balance">
                  A real way to reach a real person.
                </h2>
                <p className="mt-6 max-w-prose text-pretty text-ink/75">
                  For medical questions about your active care, message your
                  clinician inside the patient portal — that is the fastest and
                  most secure way to reach the person who actually knows your
                  chart. For everything else, use the channels below. If you
                  have a medical emergency, call 911.
                </p>
              </header>

              <dl className="space-y-6 lg:col-span-7">
                <div className="border-t border-ash-line/60 pt-6">
                  <dt className="text-eyebrow uppercase text-sage-deep">
                    General support
                  </dt>
                  <dd className="mt-2 text-lg text-ink">
                    <span className="font-mono uppercase tracking-eyebrow text-[0.72rem] text-clay-deep">
                      TODO:
                    </span>{" "}
                    support@apothem.example
                  </dd>
                  <dd className="mt-1 text-sm text-ash">
                    Responses within one business day.
                  </dd>
                </div>

                <div className="border-t border-ash-line/60 pt-6">
                  <dt className="text-eyebrow uppercase text-sage-deep">
                    Phone
                  </dt>
                  <dd className="mt-2 text-lg text-ink">
                    <span className="font-mono uppercase tracking-eyebrow text-[0.72rem] text-clay-deep">
                      TODO:
                    </span>{" "}
                    1-800-555-0144
                  </dd>
                  <dd className="mt-1 text-sm text-ash">
                    Monday–Friday, 9am–6pm ET. Not for medical emergencies.
                  </dd>
                </div>

                <div className="border-t border-ash-line/60 pt-6">
                  <dt className="text-eyebrow uppercase text-sage-deep">
                    Privacy and records requests
                  </dt>
                  <dd className="mt-2 text-lg text-ink">
                    <span className="font-mono uppercase tracking-eyebrow text-[0.72rem] text-clay-deep">
                      TODO:
                    </span>{" "}
                    privacy@apothem.example
                  </dd>
                  <dd className="mt-1 text-sm text-ash">
                    For access, correction, or deletion of your records under
                    HIPAA and applicable state law. See our{" "}
                    <a
                      href="/privacy"
                      className="underline decoration-ash-line decoration-1 underline-offset-[4px] hover:text-clay-deep hover:decoration-clay-deep"
                    >
                      Privacy Policy
                    </a>
                    .
                  </dd>
                </div>

                <div className="border-t border-b border-ash-line/60 py-6">
                  <dt className="text-eyebrow uppercase text-sage-deep">
                    Mailing address
                  </dt>
                  <dd className="mt-2 text-ink">
                    <span className="font-mono uppercase tracking-eyebrow text-[0.72rem] text-clay-deep">
                      TODO:
                    </span>{" "}
                    Apothem Health PBC, [street address], [city, state ZIP]
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
