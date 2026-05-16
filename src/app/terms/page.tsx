import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { LegalReviewBanner } from "@/components/LegalReviewBanner";

export const metadata: Metadata = {
  title: "Terms of Service · Apoth",
  description:
    "Terms of Service for Apoth, including the telehealth disclosure and the refunds and cancellation policy.",
};

const lastUpdated = "May 15, 2026";

export default function TermsPage() {
  return (
    <>
      <Nav variant="light" />
      <LegalReviewBanner />
      <main id="main" className="text-ink">
        <section className="border-b border-ash-line bg-cream py-20 md:py-24">
          <div className="mx-auto max-w-page px-6 md:px-10">
            <p className="text-eyebrow uppercase text-ash">Terms</p>
            <h1 className="display-serif mt-5 text-display-lg font-light text-balance">
              Terms of Service
            </h1>
            <p className="mt-6 max-w-measure text-pretty text-ink/75">
              The agreement between you and Apoth when you use this site or
              receive care through our platform. This page also contains the{" "}
              <Link
                href="#telehealth-disclosure"
                className="underline decoration-ash-line decoration-1 underline-offset-[4px] hover:text-clay-deep hover:decoration-clay-deep"
              >
                Telehealth Disclosure
              </Link>{" "}
              and the{" "}
              <Link
                href="#refunds-and-cancellation"
                className="underline decoration-ash-line decoration-1 underline-offset-[4px] hover:text-clay-deep hover:decoration-clay-deep"
              >
                Refunds and Cancellation Policy
              </Link>
              .
            </p>
            <p className="mt-8 font-mono text-[0.78rem] uppercase tracking-eyebrow text-ash">
              Last updated · {lastUpdated}
            </p>
          </div>
        </section>

        <div className="mx-auto max-w-page px-6 py-16 md:px-10 md:py-24">
          <div className="grid grid-cols-1 gap-x-12 gap-y-12 lg:grid-cols-12">
            <aside className="lg:col-span-3">
              <nav
                aria-label="Terms of service sections"
                className="lg:sticky lg:top-8"
              >
                <p className="text-eyebrow uppercase text-ash">On this page</p>
                <ul className="mt-4 space-y-2 text-sm text-ink/85">
                  <li>
                    <a className="hover:text-clay-deep" href="#acceptance">
                      Acceptance of these terms
                    </a>
                  </li>
                  <li>
                    <a className="hover:text-clay-deep" href="#eligibility">
                      Eligibility and accounts
                    </a>
                  </li>
                  <li>
                    <a className="hover:text-clay-deep" href="#nature">
                      Nature of the service
                    </a>
                  </li>
                  <li>
                    <a className="hover:text-clay-deep" href="#clinical">
                      Clinical services
                    </a>
                  </li>
                  <li>
                    <a className="hover:text-clay-deep" href="#pharmacy">
                      Pharmacy services
                    </a>
                  </li>
                  <li>
                    <a className="hover:text-clay-deep" href="#prescriptions">
                      Prescriptions and medications
                    </a>
                  </li>
                  <li>
                    <a className="hover:text-clay-deep" href="#fees">
                      Fees and billing
                    </a>
                  </li>
                  <li>
                    <a className="hover:text-clay-deep" href="#user-conduct">
                      Your responsibilities
                    </a>
                  </li>
                  <li>
                    <a className="hover:text-clay-deep" href="#ip">
                      Intellectual property
                    </a>
                  </li>
                  <li>
                    <a className="hover:text-clay-deep" href="#privacy-cross">
                      Privacy
                    </a>
                  </li>
                  <li>
                    <a className="hover:text-clay-deep" href="#disclaimers">
                      Disclaimers
                    </a>
                  </li>
                  <li>
                    <a className="hover:text-clay-deep" href="#liability">
                      Limitation of liability
                    </a>
                  </li>
                  <li>
                    <a className="hover:text-clay-deep" href="#indemnification">
                      Indemnification
                    </a>
                  </li>
                  <li>
                    <a className="hover:text-clay-deep" href="#disputes">
                      Disputes and arbitration
                    </a>
                  </li>
                  <li>
                    <a className="hover:text-clay-deep" href="#governing-law">
                      Governing law
                    </a>
                  </li>
                  <li>
                    <a className="hover:text-clay-deep" href="#termination">
                      Termination
                    </a>
                  </li>
                  <li>
                    <a className="hover:text-clay-deep" href="#changes">
                      Changes to these terms
                    </a>
                  </li>
                  <li>
                    <a className="hover:text-clay-deep" href="#terms-contact">
                      Contact us
                    </a>
                  </li>
                  <li className="pt-3 border-t border-ash-line">
                    <a
                      className="font-medium text-clay-deep hover:underline"
                      href="#telehealth-disclosure"
                    >
                      Telehealth Disclosure
                    </a>
                  </li>
                  <li>
                    <a
                      className="font-medium text-clay-deep hover:underline"
                      href="#refunds-and-cancellation"
                    >
                      Refunds and Cancellation
                    </a>
                  </li>
                </ul>
              </nav>
            </aside>

            <article className="lg:col-span-9">
              <Section id="acceptance" title="1. Acceptance of these terms">
                <p>
                  These Terms of Service (&ldquo;Terms&rdquo;) are a binding
                  agreement between you and Apoth Health LLC, an Illinois limited
                  liability company (&ldquo;Apoth,&rdquo;
                  &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;).
                  By accessing or using our website, mobile app, or services,
                  you agree to these Terms, our{" "}
                  <Link
                    href="/privacy"
                    className="underline decoration-ash-line underline-offset-[4px] hover:text-clay-deep"
                  >
                    Privacy Policy
                  </Link>
                  , and the disclosures linked below. If you do not agree, do
                  not use the service.
                </p>
              </Section>

              <Section id="eligibility" title="2. Eligibility and accounts">
                <ul>
                  <li>
                    You must be at least eighteen (18) years old and a resident
                    of a U.S. state where Apoth currently offers services.
                  </li>
                  <li>
                    You must provide accurate, current, and complete
                    information during registration and during clinical intake.
                    Providing false or misleading information may result in
                    denial of care, suspension of your account, and refusal of
                    refunds.
                  </li>
                  <li>
                    You are responsible for the activity that occurs under
                    your account and for keeping your credentials confidential.
                    Do not share your account with anyone.
                  </li>
                  <li>
                    Care through Apoth is for personal use only. You may not
                    request prescriptions or care on behalf of another person.
                  </li>
                </ul>
              </Section>

              <Section id="nature" title="3. Nature of the service">
                <p>
                  Apoth is a technology and patient-management platform. We
                  build and operate the website, the patient portal, the
                  intake experience, scheduling, billing, and customer support
                  that make telehealth visits possible.{" "}
                  <strong>
                    Apoth is not a medical provider, does not practice
                    medicine, and does not dispense medication.
                  </strong>{" "}
                  Apoth does not provide medical advice, diagnosis, or
                  treatment.
                </p>
                <p>
                  Clinical decisions — including whether to prescribe, what to
                  prescribe, and how to follow up — are made independently by
                  licensed clinicians of the Physician Group described below.
                  Medication is dispensed by a licensed pharmacy partner that
                  is a separate legal entity.
                </p>
              </Section>

              <Section id="clinical" title="4. Clinical services">
                <p>
                  Clinical care is provided by MD Integrations and its
                  state-specific affiliated professional entities
                  (collectively, the &ldquo;Physician Group&rdquo;). The
                  Physician Group&apos;s clinicians are licensed in the
                  state(s) in which they practice. Your prescription, if any,
                  is written by a clinician licensed in your state.
                </p>
                <p>
                  Whether to prescribe is a clinical decision. The Physician
                  Group&apos;s clinicians may decline to prescribe, may
                  prescribe a different medication or dose than you request,
                  may require additional information or labs, and may
                  recommend in-person evaluation. The Physician Group does not
                  guarantee any particular clinical outcome.
                </p>
                <p>
                  No treatment relationship is established until a clinician
                  has reviewed your intake and accepted you for care.
                </p>
              </Section>

              <Section id="pharmacy" title="5. Pharmacy services">
                <p>
                  Medications prescribed through Apoth are dispensed by a
                  licensed pharmacy partner that is a separate legal entity
                  from Apoth Health LLC and the Physician Group. The
                  pharmacy partner is responsible for compounding (where
                  applicable), labeling, dispensing, and shipping medication
                  in accordance with applicable federal and state law and its
                  own policies.
                </p>
                <p>
                  Questions about your medication, shipment, or refills may be
                  routed to the pharmacy directly. Apoth can help coordinate
                  but does not control the pharmacy&apos;s operations.
                </p>
              </Section>

              <Section
                id="prescriptions"
                title="6. Prescriptions and medications"
              >
                <p>
                  Some medications offered through Apoth are FDA-approved
                  (e.g., sildenafil, tadalafil, finasteride, minoxidil).
                  Others are{" "}
                  <strong>compounded medications that are not FDA-approved</strong>
                  , including compounded semaglutide, compounded tirzepatide,
                  BPC-157, and retatrutide. Compounded semaglutide and
                  compounded tirzepatide are not the same as Ozempic, Wegovy,
                  Mounjaro, or Zepbound. The FDA has not evaluated compounded
                  medications for safety, efficacy, or quality.
                </p>
                <p>
                  Compounded medications are prepared by a licensed 503A
                  compounding pharmacy partner under a valid prescription from
                  a clinician licensed in your state. Individual results vary
                  and are not guaranteed. Possible side effects and risks will
                  be discussed with you by your clinician before treatment.
                </p>
                <p>
                  Off-label prescribing — using an approved drug for a use, in
                  a population, or at a dose that is not specifically listed
                  in its FDA-approved label — is a lawful practice of medicine
                  when clinically appropriate. Your clinician will tell you
                  when a prescription is off-label.
                </p>
              </Section>

              <Section id="fees" title="7. Fees and billing">
                <p>
                  Fees are displayed on the website at the time of purchase.
                  By starting a visit or enrolling in a subscription, you
                  authorize Apoth (or its payment processor) to charge your
                  selected payment method for all applicable fees, taxes, and
                  shipping where charged separately.
                </p>
                <p>
                  Most categories are sold as recurring monthly subscriptions
                  for the visit and medication together. Subscriptions
                  automatically renew at the displayed price until you cancel
                  through your account or as described in the{" "}
                  <a
                    className="underline decoration-ash-line underline-offset-[4px] hover:text-clay-deep"
                    href="#refunds-and-cancellation"
                  >
                    Refunds and Cancellation Policy
                  </a>
                  . We will email a renewal reminder before each charge where
                  required by law.
                </p>
                <p>
                  Prices and offerings may change. We will not change the price
                  of an active subscription without notifying you in advance
                  and giving you a chance to cancel.
                </p>
              </Section>

              <Section id="user-conduct" title="8. Your responsibilities">
                <ul>
                  <li>
                    Provide accurate medical and identity information.
                    Falsifying information to obtain a prescription is a
                    serious safety and legal issue and may also constitute
                    fraud.
                  </li>
                  <li>
                    Take medication only as prescribed. Do not share, sell,
                    transfer, or resell medication prescribed to you.
                  </li>
                  <li>
                    Notify your clinician promptly of new symptoms, side
                    effects, hospitalizations, pregnancies, or other
                    medications.
                  </li>
                  <li>
                    Do not use the platform for any illegal purpose, to harass
                    or threaten others, or to attempt to interfere with or
                    misuse Apoth&apos;s systems.
                  </li>
                </ul>
              </Section>

              <Section id="ip" title="9. Intellectual property">
                <p>
                  The Apoth name and wordmark, the look and feel of the
                  site, and the software that powers the platform are owned by
                  Apoth Health LLC and protected by intellectual property
                  laws. We grant you a limited, revocable, non-exclusive,
                  non-transferable license to use the service for its intended
                  purpose. You may not copy, modify, reverse-engineer, or
                  create derivative works of the platform without our written
                  permission.
                </p>
              </Section>

              <Section id="privacy-cross" title="10. Privacy">
                <p>
                  How we handle your information is described in our{" "}
                  <Link
                    href="/privacy"
                    className="underline decoration-ash-line underline-offset-[4px] hover:text-clay-deep"
                  >
                    Privacy Policy
                  </Link>
                  , and how the Physician Group uses your Protected Health
                  Information is described in the{" "}
                  <Link
                    href="/privacy#notice-of-privacy-practices"
                    className="underline decoration-ash-line underline-offset-[4px] hover:text-clay-deep"
                  >
                    Notice of Privacy Practices
                  </Link>
                  . By using the service, you acknowledge those documents.
                </p>
              </Section>

              <Section id="disclaimers" title="11. Disclaimers">
                <p>
                  THE PLATFORM AND ANY CONTENT MADE AVAILABLE THROUGH IT ARE
                  PROVIDED ON AN &ldquo;AS IS&rdquo; AND &ldquo;AS
                  AVAILABLE&rdquo; BASIS WITHOUT WARRANTIES OF ANY KIND,
                  WHETHER EXPRESS OR IMPLIED, INCLUDING THE IMPLIED WARRANTIES
                  OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND
                  NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE PLATFORM WILL
                  BE UNINTERRUPTED, ERROR-FREE, OR SECURE.
                </p>
                <p>
                  Information on this site, including blog posts and
                  educational materials, is for general information only and
                  is not medical advice. Always seek the advice of your
                  clinician with any questions you may have regarding a
                  medical condition.{" "}
                  <strong>
                    If you have a medical emergency, call 911 or go to the
                    nearest emergency room.
                  </strong>
                </p>
                <p>
                  Apoth does not warrant the services of the Physician Group
                  or of the pharmacy partner; those services are governed by
                  their own respective terms, professional standards, and
                  applicable law.
                </p>
              </Section>

              <Section id="liability" title="12. Limitation of liability">
                <p>
                  TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT WILL
                  APOTH, ITS OFFICERS, DIRECTORS, EMPLOYEES, AGENTS, OR
                  AFFILIATES BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
                  CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS
                  OR REVENUES, WHETHER INCURRED DIRECTLY OR INDIRECTLY, OR ANY
                  LOSS OF DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES,
                  ARISING OUT OF OR RELATED TO YOUR USE OF THE PLATFORM.
                </p>
                <p>
                  TO THE MAXIMUM EXTENT PERMITTED BY LAW, OUR TOTAL LIABILITY
                  FOR ANY CLAIM ARISING OUT OF OR RELATING TO THESE TERMS OR
                  THE PLATFORM WILL NOT EXCEED THE GREATER OF (A) THE AMOUNT
                  YOU PAID APOTH IN THE TWELVE MONTHS BEFORE THE EVENT GIVING
                  RISE TO THE CLAIM AND (B) ONE HUNDRED U.S. DOLLARS.
                </p>
                <p>
                  Some jurisdictions do not allow the exclusion of certain
                  warranties or limitation of liability, so some of these
                  limitations may not apply to you. Nothing in these Terms
                  limits liability that cannot be limited by law.
                </p>
              </Section>

              <Section id="indemnification" title="13. Indemnification">
                <p>
                  You agree to defend, indemnify, and hold harmless Apoth
                  and its officers, directors, employees, and agents from and
                  against any claims, liabilities, damages, losses, and
                  expenses, including reasonable legal fees, arising out of or
                  in any way connected with (a) your violation of these Terms,
                  (b) your misuse of the platform, or (c) your violation of
                  any law or the rights of a third party.
                </p>
              </Section>

              <Section id="disputes" title="14. Disputes and arbitration">
                <p>
                  <strong>Please read this section carefully.</strong> Except
                  as set out below, any dispute, claim, or controversy arising
                  out of or relating to these Terms or your use of the
                  platform will be resolved by binding individual arbitration
                  under the Federal Arbitration Act, administered by a
                  recognized arbitration provider, in English, in the county
                  where you reside or another location the parties mutually
                  agree on. You and Apoth each waive the right to a trial by
                  jury and to participate in a class action or class
                  arbitration.
                </p>
                <p>
                  You may opt out of this arbitration agreement by sending
                  written notice to{" "}
                  <span className="font-mono uppercase tracking-eyebrow text-[0.72rem] text-clay-deep">
                    TODO:
                  </span>{" "}
                  legal@apoth.example within thirty (30) days of first
                  accepting these Terms. Claims for small-claims-court relief
                  and claims for injunctive relief related to intellectual
                  property may be brought in court.
                </p>
              </Section>

              <Section id="governing-law" title="15. Governing law">
                <p>
                  These Terms are governed by the laws of the State of
                  Illinois, without regard to its conflict-of-laws principles.
                  Subject to the arbitration section above, any action arising
                  out of these Terms must be brought in the state or federal
                  courts located in Illinois, and you consent to the personal
                  jurisdiction of those courts.
                </p>
              </Section>

              <Section id="termination" title="16. Termination">
                <p>
                  You may stop using the platform at any time and cancel your
                  subscription through your account. We may suspend or
                  terminate your access if you violate these Terms, if your
                  account is fraudulently used, if continued service would
                  pose a safety risk, or as required by law. Termination does
                  not affect the rights and obligations that, by their nature,
                  should survive termination, including sections 9, 11
                  through 15, and 18.
                </p>
              </Section>

              <Section id="changes" title="17. Changes to these terms">
                <p>
                  We may update these Terms from time to time. If we make
                  material changes, we will post the updated Terms on this
                  page and, where required, give you advance notice. Your
                  continued use of the platform after the updated Terms take
                  effect constitutes acceptance.
                </p>
              </Section>

              <Section id="terms-contact" title="18. Contact us">
                <p>
                  Questions about these Terms? Reach us at:
                </p>
                <p>
                  <span className="font-mono uppercase tracking-eyebrow text-[0.72rem] text-clay-deep">
                    TODO:
                  </span>{" "}
                  legal@apoth.example
                  <br />
                  <span className="font-mono uppercase tracking-eyebrow text-[0.72rem] text-clay-deep">
                    TODO:
                  </span>{" "}
                  Apoth Health LLC, [street address], [city, state ZIP]
                </p>
              </Section>

              <div className="my-20 border-t-2 border-clay-deep/30" />

              <Section
                id="telehealth-disclosure"
                title="Telehealth Disclosure"
              >
                <p>
                  Telehealth is the delivery of health-care services using
                  electronic communications — including written messaging,
                  audio, video, and the secure exchange of health information
                  — between a patient and a clinician who is not in the same
                  physical location.
                </p>

                <h3>How telehealth visits work at Apoth</h3>
                <ul>
                  <li>
                    Most visits are <strong>asynchronous</strong>: you submit
                    an intake and your clinician reviews it on their own
                    schedule, then sends questions, instructions, or a
                    treatment plan through the patient portal. You will
                    typically hear back within one business day.
                  </li>
                  <li>
                    Some visits are <strong>synchronous</strong> (real-time
                    video or phone), and your clinician may require a
                    synchronous visit before prescribing certain medications
                    or for new starts of higher-risk treatments.
                  </li>
                  <li>
                    Before your visit, you will see the name, credentials, and
                    state of licensure of the clinician assigned to your care.
                  </li>
                </ul>

                <h3>Benefits and limitations</h3>
                <p>
                  Telehealth makes care more accessible, lets you take time to
                  think before answering medical questions, and creates a
                  written record of your visit. It also has limitations.
                  Without an in-person examination, certain findings may be
                  missed, and not every condition can be safely or accurately
                  evaluated remotely.
                </p>

                <h3>When in-person care is needed</h3>
                <p>
                  Telehealth is not a substitute for emergency care.{" "}
                  <strong>
                    If you are experiencing a medical emergency — including
                    chest pain, difficulty breathing, severe abdominal pain,
                    signs of stroke, suicidal thoughts, or any condition you
                    believe may be life-threatening — call 911 or go to the
                    nearest emergency room.
                  </strong>{" "}
                  Your clinician may also recommend that you seek in-person
                  evaluation for non-emergency issues that cannot be
                  appropriately addressed through telehealth.
                </p>

                <h3>Privacy and confidentiality</h3>
                <p>
                  Telehealth visits and clinical messages are conducted
                  through a HIPAA-aware platform and are documented in your
                  medical record. See our{" "}
                  <Link
                    href="/privacy"
                    className="underline decoration-ash-line underline-offset-[4px] hover:text-clay-deep"
                  >
                    Privacy Policy
                  </Link>{" "}
                  and{" "}
                  <Link
                    href="/privacy#notice-of-privacy-practices"
                    className="underline decoration-ash-line underline-offset-[4px] hover:text-clay-deep"
                  >
                    Notice of Privacy Practices
                  </Link>
                  .
                </p>

                <h3>Your consent</h3>
                <p>
                  By starting a visit, you consent to receive care through
                  telehealth and acknowledge the benefits, limitations, and
                  potential risks described above. You may withdraw consent at
                  any time by ending your visit and contacting support; doing
                  so will not affect your right to receive future care in
                  person from another provider of your choosing.
                </p>
              </Section>

              <Section
                id="refunds-and-cancellation"
                title="Refunds and Cancellation"
              >
                <h3>Cancelling your subscription</h3>
                <p>
                  You can cancel any active subscription at any time from your
                  account settings. Cancellation takes effect at the end of
                  the current billing cycle. We will not charge a cancellation
                  fee, and we will not require you to call to cancel.
                </p>

                <h3>Refunds</h3>
                <ul>
                  <li>
                    <strong>Before clinician review.</strong> If you are not
                    accepted for care after your intake, you will be refunded
                    in full.
                  </li>
                  <li>
                    <strong>Before the pharmacy ships.</strong> If you cancel
                    after a visit but before your medication ships, the
                    medication portion of your subscription is refunded. The
                    visit fee, where charged separately, is not refundable
                    because the clinician&apos;s time has been spent.
                  </li>
                  <li>
                    <strong>After the pharmacy ships.</strong> Because
                    medication is regulated and cannot be resold or reused
                    once it has left the pharmacy, shipped medication is
                    generally non-refundable. Exceptions apply where required
                    by law or where the pharmacy makes a dispensing error
                    (wrong medication, wrong dose, wrong patient), in which
                    case the order will be corrected at no charge to you.
                  </li>
                  <li>
                    <strong>Damaged or lost shipments.</strong> If a shipment
                    arrives damaged or is lost in transit, contact us and we
                    will work with the pharmacy partner to replace it at no
                    additional cost.
                  </li>
                  <li>
                    <strong>Side effects or clinical reasons.</strong> If you
                    must stop a medication for medical reasons, contact your
                    clinician through the portal. Your clinician can adjust
                    your plan, and we will work with you on any pro-rated
                    refund or credit consistent with applicable law.
                  </li>
                </ul>

                <h3>How to request a refund</h3>
                <p>
                  Email{" "}
                  <span className="font-mono uppercase tracking-eyebrow text-[0.72rem] text-clay-deep">
                    TODO:
                  </span>{" "}
                  support@apoth.example with your order number and the
                  reason for the request. Refunds are processed to the
                  original payment method within seven to fourteen business
                  days of approval.
                </p>

                <h3>Chargebacks</h3>
                <p>
                  If you have a billing concern, please contact us first — we
                  can usually resolve issues faster than your bank can.
                  Initiating a chargeback while we are still in good-faith
                  conversation about a resolution may result in suspension of
                  your account.
                </p>
              </Section>
            </article>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 first:mt-0 mt-14">
      <h2 className="display-serif text-2xl font-light text-ink md:text-3xl">
        {title}
      </h2>
      <div className="mt-5 space-y-4 text-pretty text-ink/85 [&>h3]:display-serif [&>h3]:mt-7 [&>h3]:text-xl [&>h3]:font-light [&>h3]:text-ink [&>ul]:list-disc [&>ul]:space-y-2 [&>ul]:pl-5 [&>ul_li]:text-pretty">
        {children}
      </div>
    </section>
  );
}
