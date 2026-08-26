import type { Metadata } from "next";
import Image from "next/image";
import {
  ArrowRight,
  Check,
  LockKeyhole,
  PackageCheck,
  ShieldCheck,
  Truck,
} from "lucide-react";

import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import { onboardingHref } from "@/lib/public-commerce";

import styles from "./page.module.css";

const weightOnboardingHref = onboardingHref("weight");

export const metadata: Metadata = {
  title: "Personalized GLP-1 Treatments | Apoth",
  description:
    "Provider-led weight management with personalized GLP-1 treatment options, ongoing support, and free expedited shipping.",
};

const offers = [
  {
    title: "Compounded semaglutide",
    price: "$99",
    cadence: "/month*",
    copy: "A provider may consider semaglutide after reviewing your health history and clinical eligibility.",
  },
  {
    title: "Compounded tirzepatide",
    price: "$199",
    cadence: "/month*",
    copy: "A provider may consider tirzepatide after reviewing your health history and clinical eligibility.",
  },
];

const inclusions = [
  { icon: ShieldCheck, text: "Independent licensed-provider evaluation" },
  { icon: PackageCheck, text: "Medication and standard supplies, if prescribed" },
  { icon: Truck, text: "Free expedited shipping" },
  { icon: LockKeyhole, text: "Ongoing clinical messaging in the provider portal" },
];

const howItWorksSteps = [
  {
    title: "Start with a short precheck",
    copy: "Confirm basic availability and create your passwordless Apoth account. No clinical answers are stored by Apoth.",
  },
  {
    title: "Complete the clinical intake",
    copy: "Share your health history inside the independent provider’s secure portal.",
  },
  {
    title: "Receive an independent review",
    copy: "A licensed provider determines whether treatment is appropriate. A prescription is not guaranteed.",
  },
  {
    title: "Review the exact offer",
    copy: "If approved, accept the treatment and recurring price separately before the first charge begins.",
  },
];

const faqs = [
  {
    question: "What’s included with my plan?",
    answer:
      "The displayed self-pay price includes the independent clinical evaluation, ongoing clinical messaging, standard injection supplies, medication, and expedited shipping only if prescribed. Separately required labs are not included.",
  },
  {
    question: "What treatment options are available?",
    answer:
      "Licensed providers may consider compounded semaglutide or compounded tirzepatide based on health history, goals, state, and clinical eligibility.",
  },
  {
    question: "Are compounded medications FDA-approved?",
    answer:
      "No. Compounded medications are not FDA-approved, and the FDA does not review them for safety, effectiveness, or quality. They are not the same as brand-name products.",
  },
  {
    question: "When does billing begin?",
    answer:
      "Saving a payment method is $0 due. No subscription or first charge starts until clinical approval and your separate acceptance of the exact treatment and recurring price.",
  },
  {
    question: "Can I cancel?",
    answer:
      "There is no long-term contract. An active plan can be canceled before its next renewal from your account, subject to the treatment and shipment status described in the Terms.",
  },
];

function FaqRow({ question, answer }: { question: string; answer: string }) {
  return (
    <details className={styles.faqRow}>
      <summary><span>{question}</span><span className={styles.plus} aria-hidden="true" /></summary>
      <p>{answer}</p>
    </details>
  );
}

export default function WeightLossPage() {
  return (
    <>
      <Nav ctaHref={weightOnboardingHref} ctaLabel="Start the $0 precheck" />
      <main id="main" className={`${styles.page} marketing-v2`}>
      <div id="main-content">
        <section className={styles.hero}>
          <div className={styles.heroMedia}>
            {/* next/image with `fill` requires a relative/absolute/fixed
                parent. The panel itself has to stay sticky, so the image gets
                its own relative wrapper inside it. */}
            <div className={styles.heroMediaInner}>
              <Image
                src="/images/apoth-weight-loss-hero.webp"
                alt="Unbranded weight-management treatment vial and injector pens"
                fill
                priority
                sizes="(min-width: 960px) 58vw, 100vw"
                className={styles.heroImage}
              />
            </div>
          </div>

          <div className={styles.heroDetails}>
            <h1>Personalized GLP‑1 treatment</h1>
            <p className={styles.subtitle}>A provider-led weight-care plan with straightforward monthly pricing and ongoing clinical support.</p>

            <div className={styles.pricingPanel}>
              <p className={styles.reviewNote}>
                <ShieldCheck aria-hidden="true" /> Independent provider review required. Starting the precheck is $0.
              </p>
              <div className={styles.priceRows}>
                {offers.map((offer) => (
                  <div className={styles.priceRow} key={offer.title}>
                    <span>{offer.title}</span>
                    <strong>{offer.price}<small>{offer.cadence}</small></strong>
                  </div>
                ))}
              </div>
              <a className={styles.primaryButton} href={weightOnboardingHref}>Start the $0 precheck <ArrowRight aria-hidden="true" /></a>
              <p className={styles.microcopy}>*Self-pay price includes clinical care, standard injection supplies, medication, and expedited shipping only if prescribed. Due before intake: $0. Plans renew monthly only after clinical approval and separate acceptance of the exact treatment and price. Labs, if separately required, are not included.</p>
            </div>

            <ul className={styles.inclusions} aria-label="What the program includes">
              {inclusions.map(({ icon: Icon, text }) => <li key={text}><Icon aria-hidden="true" /> {text}</li>)}
            </ul>

            <a className={styles.safetyLink} href="#safety">Important safety and compounded-medication information</a>
          </div>
        </section>

        <section className={styles.options} id="options">
          <div className={styles.optionsIntro}>
            <h2>Two options. One independent clinical decision.</h2>
            <p>You can understand the plan structure here. Your provider decides whether either treatment is appropriate after reviewing your clinical information.</p>
          </div>
          <div className={styles.optionList}>
            {offers.map((offer, index) => (
              <article className={styles.optionRow} key={offer.title}>
                <div className={styles.optionImage}>
                  <Image
                    src="/images/weight-loss-vial.webp"
                    alt="Unbranded compounded medication vial"
                    fill
                    sizes="180px"
                    className={index === 1 ? styles.optionImageAlt : undefined}
                  />
                </div>
                <div className={styles.optionBody}>
                  <h3>{offer.title}</h3>
                  <p>{offer.copy}</p>
                  <strong>{offer.price}<small>{offer.cadence}</small></strong>
                  <a href={weightOnboardingHref}>Start the $0 precheck <ArrowRight aria-hidden="true" /></a>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.process} id="how-it-works">
          <div className={styles.processImage}>
            <Image
              src="/images/how-it-works-member.webp"
              alt="A member checking her care plan on her phone"
              fill
              sizes="(min-width: 900px) 46vw, 100vw"
            />
          </div>
          <div className={styles.processBody}>
            <h2>From first click to provider review</h2>
            <ol>
              {howItWorksSteps.map((step, index) => (
                <li key={step.title}>
                  <span>{index + 1}</span>
                  <div><h3>{step.title}</h3><p>{step.copy}</p></div>
                </li>
              ))}
            </ol>
            <a className={styles.lightButton} href={weightOnboardingHref}>Start the $0 precheck</a>
          </div>
        </section>

        <section className={styles.boundary}>
          <div className={styles.boundaryArt} aria-hidden="true">
            <Image src="/images/weight-loss-syringe.webp" alt="" fill sizes="46vw" />
          </div>
          <div className={styles.boundaryCopy}>
            <h2>Care stays with your provider. The connection stays simple.</h2>
            <p>Your questionnaire, clinical review, and medical record live in the independent provider’s secure portal. Apoth keeps the account, consent evidence, billing status, and secure linkage needed to help you move between steps.</p>
            <ul>
              <li><Check aria-hidden="true" /> Clinical answers are not stored by Apoth</li>
              <li><Check aria-hidden="true" /> Payment-method setup is $0 due</li>
              <li><Check aria-hidden="true" /> Exact offer acceptance comes before billing</li>
            </ul>
          </div>
        </section>

        <section className={styles.faqSection} id="faq">
          <div>
            <h2>What to know before you start</h2>
            <p>Clear answers about treatment, pricing, and the care relationship.</p>
          </div>
          <div className={styles.faqList}>
            {faqs.map((faq) => <FaqRow key={faq.question} {...faq} />)}
          </div>
        </section>

        <section className={styles.safety} id="safety">
          <strong>Important compounded-medication information</strong>
          <p>Compounded semaglutide and compounded tirzepatide are not FDA-approved. They are not the same as Ozempic, Wegovy, Mounjaro, or Zepbound, and have not been evaluated by the FDA for safety, effectiveness, or quality. They are prepared by a licensed 503A compounding pharmacy partner only under a valid prescription from an independent clinician licensed in your state. Treatment is not guaranteed and results vary.</p>
        </section>

        <section className={styles.close}>
          <h2>See whether weight care fits you</h2>
          <p>Start with a short precheck. There is no charge before clinical approval and your separate acceptance of the exact offer.</p>
          <a className={styles.primaryButton} href={weightOnboardingHref}>Start the $0 precheck <ArrowRight aria-hidden="true" /></a>
        </section>
      </div>

      <div className={styles.mobileCta}>
        <a href={weightOnboardingHref}>Start the $0 precheck <ArrowRight aria-hidden="true" /></a>
      </div>

      <Footer />
      </main>
    </>
  );
}
