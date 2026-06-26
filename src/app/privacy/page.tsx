import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { LegalReviewBanner } from "@/components/LegalReviewBanner";

export const metadata: Metadata = {
  title: "Privacy Policy · Apoth",
  description:
    "How Apoth handles account, billing, intake handoff, linkage, and support information, including the HIPAA Notice of Privacy Practices.",
};

const lastUpdated = "June 23, 2026";

export default function PrivacyPage() {
  return (
    <>
      <Nav variant="light" />
      <LegalReviewBanner />
      <main id="main" className="text-ink">
        <section className="border-b border-ash-line bg-cream py-20 md:py-24">
          <div className="mx-auto max-w-page px-6 md:px-10">
            <p className="text-eyebrow uppercase text-ash">Privacy</p>
            <h1 className="display-serif mt-5 text-display-lg font-light text-balance">
              Privacy Policy
            </h1>
            <p className="mt-6 max-w-measure text-pretty text-ink/75">
              How Apoth handles account, billing, intake handoff, linkage, and
              support information. This page also contains the{" "}
              <Link
                href="#notice-of-privacy-practices"
                className="underline decoration-ash-line decoration-1 underline-offset-[4px] hover:text-clay-deep hover:decoration-clay-deep"
              >
                HIPAA Notice of Privacy Practices
              </Link>{" "}
              for MD Integrations.
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
                aria-label="Privacy policy sections"
                className="lg:sticky lg:top-8"
              >
                <p className="text-eyebrow uppercase text-ash">On this page</p>
                <ul className="mt-4 space-y-2 text-sm text-ink/85">
                  <li>
                    <a className="hover:text-clay-deep" href="#who-we-are">
                      Who we are
                    </a>
                  </li>
                  <li>
                    <a className="hover:text-clay-deep" href="#information-we-collect">
                      Information we collect
                    </a>
                  </li>
                  <li>
                    <a className="hover:text-clay-deep" href="#how-we-use">
                      How we use information
                    </a>
                  </li>
                  <li>
                    <a className="hover:text-clay-deep" href="#how-we-share">
                      How we share information
                    </a>
                  </li>
                  <li>
                    <a className="hover:text-clay-deep" href="#your-rights">
                      Your rights
                    </a>
                  </li>
                  <li>
                    <a className="hover:text-clay-deep" href="#security">
                      Security and breach notification
                    </a>
                  </li>
                  <li>
                    <a className="hover:text-clay-deep" href="#retention">
                      Data retention
                    </a>
                  </li>
                  <li>
                    <a className="hover:text-clay-deep" href="#cookies">
                      Cookies and analytics
                    </a>
                  </li>
                  <li>
                    <a className="hover:text-clay-deep" href="#children">
                      Children
                    </a>
                  </li>
                  <li>
                    <a className="hover:text-clay-deep" href="#changes">
                      Changes to this policy
                    </a>
                  </li>
                  <li>
                    <a className="hover:text-clay-deep" href="#privacy-contact">
                      Contact us
                    </a>
                  </li>
                  <li className="pt-3 border-t border-ash-line">
                    <a
                      className="font-medium text-clay-deep hover:underline"
                      href="#notice-of-privacy-practices"
                    >
                      HIPAA Notice of Privacy Practices
                    </a>
                  </li>
                </ul>
              </nav>
            </aside>

            <article className="prose-policy lg:col-span-9">
              <Section id="who-we-are" title="1. Who we are">
                <p>
                  Apoth is operated by Apoth Health LLC, an Illinois limited
                  liability company (&ldquo;Apoth,&rdquo; &ldquo;we,&rdquo;
                  &ldquo;us,&rdquo; or &ldquo;our&rdquo;). Apoth is a
                  telehealth technology platform. We operate the account,
                  commerce, intake user interface, and minimal care-workflow
                  linkage layer. We are not a medical provider and we do not
                  dispense medication.
                </p>
                <p>
                  Clinical care is provided by independent licensed clinicians
                  of MD Integrations and its state-specific affiliated
                  professional entities (collectively the &ldquo;Physician
                  Group&rdquo;). The Physician Group is a covered entity under
                  the Health Insurance Portability and Accountability Act of
                  1996, as amended (&ldquo;HIPAA&rdquo;). Before production PHI
                  is handled for the Physician Group, Apoth must have the
                  required business-associate agreement and vendor evidence in
                  place. MD Integrations is the clinical system of record for
                  questionnaire answers, clinician review, treatment decisions,
                  and clinical messages.
                </p>
                <p>
                  Medication is dispensed by a licensed pharmacy partner that
                  is a separate legal entity. Information shared with the
                  pharmacy is governed by the pharmacy&apos;s own privacy
                  practices and by HIPAA where applicable.
                </p>
                <p>
                  This Privacy Policy describes the information practices of
                  Apoth Health LLC. The{" "}
                  <a
                    className="underline decoration-ash-line underline-offset-[4px] hover:text-clay-deep"
                    href="#notice-of-privacy-practices"
                  >
                    Notice of Privacy Practices
                  </a>{" "}
                  further below describes how the Physician Group uses and
                  discloses PHI.
                </p>
              </Section>

              <Section
                id="information-we-collect"
                title="2. Information we collect"
              >
                <h3>Information you give us directly</h3>
                <ul>
                  <li>
                    <strong>Account and contact information</strong> — your
                    name, date of birth, email address, phone number, mailing
                    address, and government-issued ID where required for
                    identity verification.
                  </li>
                  <li>
                    <strong>Clinical intake information in transit</strong> —
                    the questionnaire answers, symptoms, history, medication
                    information, allergies, uploads, and messages you submit for
                    clinician review. Apoth may process this information briefly
                    to send it to MD Integrations, but Apoth does not keep
                    questionnaire answers as its own local clinical record after
                    submission. This information is PHI when handled for the
                    Physician Group.
                  </li>
                  <li>
                    <strong>Minimal workflow records</strong> — opaque IDs and
                    statuses needed to link your Apoth account to MD
                    Integrations, the pharmacy workflow, and billing, such as
                    MDI patient/case IDs, Stripe customer/subscription IDs,
                    consent timestamps, onboarding state, billing state, and
                    non-clinical support history.
                  </li>
                  <li>
                    <strong>Payment information</strong> — your billing address
                    and the last four digits of your payment method. Full
                    payment card numbers are processed by our PCI-compliant
                    payment processor and are not stored on Apoth&apos;s
                    servers.
                  </li>
                  <li>
                    <strong>Communications</strong> — emails, support tickets,
                    and chat messages you send us.
                  </li>
                </ul>
                <h3>Information we collect automatically</h3>
                <ul>
                  <li>
                    <strong>Device and usage data</strong> — IP address, device
                    type, operating system, browser, pages viewed, referring
                    URL, and timestamps.
                  </li>
                  <li>
                    <strong>Cookies and similar technologies</strong> — see{" "}
                    <a
                      className="underline decoration-ash-line underline-offset-[4px] hover:text-clay-deep"
                      href="#cookies"
                    >
                      Section 8
                    </a>
                    .
                  </li>
                </ul>
                <h3>Information from third parties</h3>
                <ul>
                  <li>
                    Identity verification providers, fraud-prevention
                    providers, and the licensed pharmacy partner (e.g.,
                    shipment status and dispense confirmation).
                  </li>
                </ul>
              </Section>

              <Section id="how-we-use" title="3. How we use information">
                <p>We use the information described above to:</p>
                <ul>
                  <li>
                    Present the intake experience, send submitted clinical
                    information to MD Integrations, and maintain the minimal
                    linkage needed to show patient-safe workflow status.
                  </li>
                  <li>
                    Coordinate non-clinical workflow steps with MD Integrations
                    and, where applicable, the licensed pharmacy partner, such
                    as dispense or shipping confirmations.
                  </li>
                  <li>
                    Process payments, send receipts, and respond to billing
                    inquiries.
                  </li>
                  <li>
                    Verify your identity where required and prevent fraud,
                    abuse, and diversion of controlled or regulated substances.
                  </li>
                  <li>
                    Provide customer support and operate, secure, and improve
                    the platform.
                  </li>
                  <li>
                    Send service-related communications (appointment reminders,
                    refill reminders, account notices). Marketing
                    communications are only sent with your consent, and you can
                    withdraw consent at any time.
                  </li>
                  <li>
                    Comply with legal obligations, including platform,
                    payment, telehealth, pharmacy, and lawful government
                    request obligations that apply to the information we
                    handle.
                  </li>
                </ul>
                <p>
                  We do not sell your personal or health information. We do not
                  use your health information to serve targeted advertising.
                </p>
              </Section>

              <Section id="how-we-share" title="4. How we share information">
                <ul>
                  <li>
                    <strong>With the Physician Group.</strong> We send your
                    submitted clinical intake information to MD Integrations so
                    a licensed clinician can review it and provide care. The
                    Physician Group is a HIPAA covered entity and maintains the
                    clinical record for that care.
                  </li>
                  <li>
                    <strong>With the licensed pharmacy partner.</strong> We
                    coordinate the minimum information needed to fill and ship
                    an approved prescription, such as patient, shipping,
                    prescription, dispense, and shipment status information
                    routed through the clinical/pharmacy workflow. The pharmacy
                    is a separate legal entity governed by its own privacy
                    practices and applicable law.
                  </li>
                  <li>
                    <strong>With service providers.</strong> Vendors that host
                    our infrastructure, process payments, verify identity where
                    required, deliver email and SMS, run approved analytics, or
                    provide customer support. Vendors that handle PHI sign a
                    approved BAA/compliance path with us or with the Physician
                    Group as applicable before production PHI is handled.
                    Payment processor metadata is limited to opaque, non-PHI
                    identifiers.
                  </li>
                  <li>
                    <strong>For legal, safety, and compliance reasons.</strong>{" "}
                    To comply with law, court orders, subpoenas, or government
                    requests; to enforce our terms; to investigate fraud; to
                    protect the rights, safety, or property of Apoth, our
                    users, or others; or to report public health information
                    where required.
                  </li>
                  <li>
                    <strong>With your authorization.</strong> Any other sharing
                    requires your written authorization, which you can revoke
                    at any time.
                  </li>
                  <li>
                    <strong>In a business transaction.</strong> If Apoth is
                    involved in a merger, acquisition, financing, or sale of
                    assets, your information may be transferred subject to
                    HIPAA, applicable law, and continued privacy protections.
                  </li>
                </ul>
                <p>
                  We do not sell your personal information or PHI. We do not
                  share PHI for marketing without your written authorization.
                </p>
              </Section>

              <Section id="your-rights" title="5. Your rights">
                <p>
                  Subject to HIPAA, state law, and applicable consumer privacy
                  laws, you have the right to:
                </p>
                <ul>
                  <li>
                    <strong>Access</strong> your records and request a copy of
                    the personal information Apoth holds about you. We will
                    help route medical-record requests to the Physician Group
                    when the record is maintained by MD Integrations.
                  </li>
                  <li>
                    <strong>Correct</strong> information that is inaccurate or
                    incomplete.
                  </li>
                  <li>
                    <strong>Request deletion</strong> of personal information
                    Apoth no longer needs to retain. Medical records held by
                    the Physician Group are subject to state and federal
                    medical-record retention requirements and cannot always be
                    deleted on request.
                  </li>
                  <li>
                    <strong>Restrict</strong> certain uses or disclosures of
                    PHI held by or for the Physician Group, subject to HIPAA
                    limits.
                  </li>
                  <li>
                    <strong>Receive an accounting</strong> of certain
                    disclosures of your PHI from the covered entity responsible
                    for the record.
                  </li>
                  <li>
                    <strong>Request confidential communications</strong> by an
                    alternative means or at an alternative address.
                  </li>
                  <li>
                    <strong>Withdraw consent</strong> for marketing
                    communications at any time.
                  </li>
                  <li>
                    <strong>Lodge a complaint</strong> with us or with the U.S.
                    Department of Health and Human Services Office for Civil
                    Rights without fear of retaliation.
                  </li>
                </ul>
                <p>
                  Residents of California, Colorado, Connecticut, Virginia,
                  Utah, and certain other states may have additional rights
                  under their state privacy laws, including the right to
                  appeal a denied request. To exercise any of these rights,
                  contact us using the channels in{" "}
                  <a
                    className="underline decoration-ash-line underline-offset-[4px] hover:text-clay-deep"
                    href="#privacy-contact"
                  >
                    Section 11
                  </a>
                  .
                </p>
              </Section>

              <Section id="security" title="6. Security and breach notification">
                <p>
                  We use administrative, physical, and technical safeguards
                  designed to protect your information, including encryption in
                  transit and at rest, role-based access controls, audit
                  logging, multi-factor authentication for workforce members,
                  and a vendor security review program. No system can be
                  guaranteed to be 100% secure.
                </p>
                <p>
                  In the event of a breach of unsecured PHI, we will notify
                  affected individuals consistent with HIPAA and applicable
                  state law, generally without unreasonable delay and in no
                  case later than 60 days after discovery. Where required, we
                  will also notify the U.S. Department of Health and Human
                  Services and the media.
                </p>
              </Section>

              <Section id="retention" title="7. Data retention">
                <p>
                  We retain personal information for as long as needed to
                  provide our services and to comply with our legal
                  obligations. Apoth does not retain questionnaire answers as
                  its own local clinical record after successful handoff to MD
                  Integrations. Medical records are retained by the Physician
                  Group for the period required by the laws of the state in
                  which the clinician is licensed, which is typically a minimum
                  of seven years from the date of last service and longer in
                  the case of minors. When Apoth-held information is no longer
                  required, we securely delete or de-identify it.
                </p>
              </Section>

              <Section id="cookies" title="8. Cookies and analytics">
                <p>
                  We use a small number of strictly-necessary cookies to keep
                  you signed in and to operate the site. We use
                  privacy-respecting analytics to understand how the site is
                  used in aggregate. We do not use third-party advertising
                  cookies on pages that handle PHI. Where required by law, we
                  request your consent before setting non-essential cookies.
                </p>
                <p>
                  You can manage cookies through your browser settings.
                  Disabling strictly-necessary cookies may break parts of the
                  site.
                </p>
              </Section>

              <Section id="children" title="9. Children">
                <p>
                  Apoth is intended for adults aged eighteen and older. We do
                  not knowingly collect personal information from anyone under
                  eighteen. If you believe a child has provided us with
                  information, contact us and we will delete it.
                </p>
              </Section>

              <Section id="changes" title="10. Changes to this policy">
                <p>
                  We may update this Privacy Policy from time to time. We will
                  post the updated policy on this page and, for material
                  changes, give you advance notice by email or through the
                  patient portal. The &ldquo;Last updated&rdquo; date at the
                  top of this page indicates when the policy was most recently
                  revised.
                </p>
              </Section>

              <Section id="privacy-contact" title="11. Contact us">
                <p>
                  For privacy and records requests, contact our Privacy
                  Officer:
                </p>
                <p>
                  <span className="font-mono uppercase tracking-eyebrow text-[0.72rem] text-clay-deep">
                    TODO:
                  </span>{" "}
                  privacy@apoth.example
                  <br />
                  <span className="font-mono uppercase tracking-eyebrow text-[0.72rem] text-clay-deep">
                    TODO:
                  </span>{" "}
                  Apoth Health LLC, [street address], [city, state ZIP]
                </p>
                <p>
                  To file a HIPAA complaint with the federal government, you
                  may contact the U.S. Department of Health and Human Services
                  Office for Civil Rights at{" "}
                  <a
                    className="underline decoration-ash-line underline-offset-[4px] hover:text-clay-deep"
                    href="https://www.hhs.gov/hipaa/filing-a-complaint/index.html"
                    rel="noreferrer"
                    target="_blank"
                  >
                    hhs.gov/hipaa/filing-a-complaint
                  </a>
                  .
                </p>
              </Section>

              <div className="my-20 border-t-2 border-clay-deep/30" />

              <Section
                id="notice-of-privacy-practices"
                title="HIPAA Notice of Privacy Practices"
              >
                <p className="text-pretty rounded border border-clay-deep/30 bg-clay-tint/30 p-4 text-sm uppercase tracking-eyebrow text-ink">
                  This notice describes how medical information about you may
                  be used and disclosed and how you can get access to this
                  information. Please review it carefully.
                </p>

                <h3>Who follows this Notice</h3>
                <p>
                  This Notice is issued by MD Integrations and its
                  state-specific affiliated professional entities
                  (collectively, the &ldquo;Physician Group&rdquo;), which is a
                  HIPAA covered entity. It applies to the PHI created and
                  received by the Physician Group in connection with your
                  care.
                </p>

                <h3>How the Physician Group may use and disclose your PHI</h3>
                <p>
                  The Physician Group is permitted to use and disclose your PHI
                  without your specific authorization for the following
                  purposes:
                </p>
                <ul>
                  <li>
                    <strong>Treatment.</strong> To provide, coordinate, or
                    manage your health care, including sharing PHI with the
                    licensed pharmacy partner that fills your prescription and
                    with laboratories that perform tests you authorize.
                  </li>
                  <li>
                    <strong>Payment.</strong> To bill and collect payment for
                    services, verify insurance coverage where applicable, and
                    coordinate benefits.
                  </li>
                  <li>
                    <strong>Health care operations.</strong> For activities
                    such as quality assessment, clinician credentialing,
                    training, audits, accreditation, business management, and
                    customer service. Before production PHI is shared with
                    Apoth Health LLC for these operations, the required
                    business-associate agreement and vendor evidence must be in
                    place.
                  </li>
                  <li>
                    <strong>Appointment reminders and care messages</strong>{" "}
                    related to your active treatment.
                  </li>
                  <li>
                    <strong>As required by law,</strong> including reporting
                    abuse or neglect, responding to court orders or subpoenas,
                    reporting communicable diseases or adverse drug events,
                    and complying with public health activities.
                  </li>
                  <li>
                    <strong>To avert a serious threat</strong> to your health
                    or safety or that of another person.
                  </li>
                  <li>
                    <strong>For specialized government functions,</strong>{" "}
                    including military and veterans&apos; activities, national
                    security, protective services, and inmate care, where
                    permitted by law.
                  </li>
                  <li>
                    <strong>For workers&apos; compensation</strong> programs as
                    authorized by law.
                  </li>
                  <li>
                    <strong>For research</strong> only with your authorization
                    or after an institutional review board has approved a
                    waiver.
                  </li>
                </ul>

                <h3>Uses and disclosures that require your authorization</h3>
                <p>
                  Most uses and disclosures of psychotherapy notes, uses and
                  disclosures for marketing purposes, and any sale of PHI
                  require your written authorization. You may revoke an
                  authorization in writing at any time, except where action
                  has already been taken in reliance on it.
                </p>

                <h3>Your rights regarding your PHI</h3>
                <ul>
                  <li>
                    <strong>Right to inspect and copy.</strong> You may
                    inspect and obtain a copy of PHI the Physician Group
                    maintains about you, subject to limited exceptions.
                  </li>
                  <li>
                    <strong>Right to amend.</strong> You may request that we
                    amend PHI you believe is inaccurate or incomplete.
                  </li>
                  <li>
                    <strong>Right to an accounting of disclosures.</strong> You
                    may request a list of certain disclosures of your PHI made
                    by the Physician Group in the six years prior to your
                    request.
                  </li>
                  <li>
                    <strong>Right to request restrictions.</strong> You may
                    request that we restrict certain uses or disclosures of
                    your PHI. We must agree to a restriction on disclosure to
                    a health plan for purposes of payment or operations where
                    you have paid out of pocket in full for the item or
                    service.
                  </li>
                  <li>
                    <strong>Right to request confidential communications.</strong>{" "}
                    You may request that we contact you by a specific means or
                    at a specific location.
                  </li>
                  <li>
                    <strong>Right to a paper copy of this Notice.</strong> You
                    may request a paper copy of this Notice at any time even
                    if you have agreed to receive it electronically.
                  </li>
                  <li>
                    <strong>Right to be notified of a breach</strong> of your
                    unsecured PHI.
                  </li>
                  <li>
                    <strong>Right to opt out</strong> of certain communications
                    and fundraising activities.
                  </li>
                </ul>

                <h3>Our duties</h3>
                <p>
                  The Physician Group is required by law to maintain the
                  privacy of your PHI, to provide you with this Notice of its
                  legal duties and privacy practices, and to abide by the terms
                  of the Notice currently in effect. The Physician Group
                  reserves the right to change this Notice and to make the new
                  Notice provisions effective for all PHI it maintains.
                </p>

                <h3>Complaints</h3>
                <p>
                  If you believe your privacy rights have been violated, you
                  may file a complaint with the Physician Group&apos;s Privacy
                  Officer (see{" "}
                  <a
                    className="underline decoration-ash-line underline-offset-[4px] hover:text-clay-deep"
                    href="#privacy-contact"
                  >
                    contact information above
                  </a>
                  ) or with the U.S. Department of Health and Human Services
                  Office for Civil Rights. The Physician Group will not
                  retaliate against you for filing a complaint.
                </p>

                <h3>Effective date</h3>
                <p>This Notice is effective as of {lastUpdated}.</p>
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
