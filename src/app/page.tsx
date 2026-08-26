import Image from "next/image";
import type { CSSProperties } from "react";
import {
  ArrowRight,
  BadgeDollarSign,
  CalendarClock,
  Check,
  LockKeyhole,
  ShieldCheck,
  Truck,
} from "lucide-react";

import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import { MotionObserver } from "@/components/marketing-v2/MotionObserver";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/marketing-v2/ui/Accordion";
import { onboardingHref } from "@/lib/public-commerce";

import styles from "./home.module.css";

const weightOnboardingHref = onboardingHref("weight");

const proofPoints = [
  { icon: BadgeDollarSign, title: "Straightforward pricing", copy: "Know the plan price before you accept it." },
  { icon: ShieldCheck, title: "Independent review", copy: "A licensed provider decides what is appropriate." },
  { icon: Truck, title: "Delivery included", copy: "Free expedited shipping when treatment is prescribed." },
];

const carePaths = [
  { label: "Weight loss", detail: "Available now · plans from $199/mo*", href: "/weight-loss" },
  { label: "NAD+", detail: "Planned · not currently available", href: "/nad" },
];

const steps = [
  {
    title: "Choose where to begin",
    copy: "Review the weight-care program, pricing, and what is included before starting.",
  },
  {
    title: "Enter the clinical portal",
    copy: "Complete your medical questionnaire with the independent provider—not inside Apoth.",
  },
  {
    title: "Accept an approved offer",
    copy: "After clinical approval, review the exact treatment and price before any recurring charge starts.",
  },
];

const faqs = [
  [
    "What states do you serve?",
    "Online care is available where clinician licensure, clinical eligibility, and pharmacy shipping rules support the requested treatment. Availability is confirmed during intake.",
  ],
  [
    "Do you take insurance?",
    "Insurance is not required. Programs use straightforward self-pay pricing, and eligible customers may use FSA or HSA funds for qualifying purchases.",
  ],
  [
    "Who provides medical care?",
    "Independent licensed providers review clinical information and make treatment decisions. Apoth supplies the technology, account, and commerce experience.",
  ],
  [
    "When would I be charged?",
    "Payment-method setup is $0 due. Billing does not begin until clinical approval and your separate acceptance of the exact recurring treatment offer.",
  ],
  [
    "Where does the medical questionnaire live?",
    "The questionnaire and clinical record stay in the independent provider’s secure portal. Apoth keeps only the account, billing status, and opaque linkage needed for the handoff.",
  ],
];

export default function Home() {
  return (
    <>
      <Nav />
      <main id="main" className={`${styles.page} marketing-v2`}>
      <MotionObserver />

      <div id="main-content">
        <section className={styles.hero} aria-labelledby="home-heading">
          <div className={styles.heroIntro}>
            <h1 id="home-heading">Better health has never been easier</h1>
            <ul className={styles.proofList} aria-label="Why begin with Apoth">
              {proofPoints.map(({ icon: Icon, title, copy }) => (
                <li key={title}>
                  <Icon aria-hidden="true" />
                  <span><strong>{title}</strong>{copy}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className={styles.storyMosaic}>
            <a className={styles.weightStory} href="/weight-loss" aria-label="Explore weight-loss care">
              <div className={styles.storyCopy}>
                <h2>Weight care, built around you</h2>
                <p>Provider-led GLP-1 options from $199/month*</p>
                <span className={styles.storyAction}>Explore weight care <ArrowRight aria-hidden="true" /></span>
              </div>
              <Image
                src="/images/apoth-weight-loss-hero.webp"
                alt="Unbranded weight-management treatment vial and injector pens"
                fill
                priority
                sizes="(min-width: 1024px) 64vw, 100vw"
                className={styles.productImage}
              />
            </a>

            <article className={styles.humanStory}>
              <div className={styles.humanImageWrap}>
                <Image
                  src="/images/weight-management-lifestyle.webp"
                  alt="A smiling woman moving confidently outdoors"
                  fill
                  priority
                  sizes="(min-width: 1024px) 34vw, 100vw"
                  className={styles.humanImage}
                />
              </div>
              <div className={styles.humanCopy}>
                <LockKeyhole aria-hidden="true" />
                <h2>One account. A clear handoff.</h2>
                <p>Apoth connects your choices, account, and billing status to independent clinical care.</p>
              </div>
            </article>
          </div>

          <nav className={styles.careStrip} aria-label="Care categories" id="care-paths">
            {carePaths.map((path) => path.href ? (
              <a href={path.href} key={path.label}>
                <span><strong>{path.label}</strong><small>{path.detail}</small></span>
                <ArrowRight aria-hidden="true" />
              </a>
            ) : (
              <div key={path.label}>
                <span><strong>{path.label}</strong><small>{path.detail}</small></span>
              </div>
            ))}
          </nav>
        </section>

        <section className={styles.process} id="how-it-works">
          <div className={styles.processInner}>
            <div className={styles.processHeading} data-reveal>
              <h2>A clear path from choice to care</h2>
              <p>Apoth keeps the experience connected while each organization stays responsible for its part.</p>
              <a href={weightOnboardingHref}>See if online care fits <ArrowRight aria-hidden="true" /></a>
            </div>
            <ol className={styles.steps}>
              {steps.map((step, index) => (
                <li key={step.title} data-reveal style={{ "--reveal-delay": `${index * 80}ms` } as CSSProperties}>
                  <span>{index + 1}</span>
                  <div><h3>{step.title}</h3><p>{step.copy}</p></div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className={styles.weightEditorial} id="weight-care">
          <div className={styles.weightImage} data-reveal>
            <Image
              src="/images/weight-management-lifestyle.webp"
              alt="A woman moving confidently outdoors"
              fill
              sizes="(min-width: 900px) 50vw, 100vw"
            />
          </div>
          <div className={styles.weightCopy} data-reveal>
            <h2>Weight care that starts with the whole picture</h2>
            <p>Review transparent plan pricing, complete your clinical intake securely, and stay connected to provider-led follow-up.</p>
            <ul>
              <li><Check aria-hidden="true" /> Independent licensed-provider evaluation</li>
              <li><Check aria-hidden="true" /> Compounded semaglutide from $199/month*</li>
              <li><Check aria-hidden="true" /> Compounded tirzepatide from $299/month*</li>
              <li><Check aria-hidden="true" /> No charge before approval and offer acceptance</li>
            </ul>
            <a className={styles.primaryButton} href="/weight-loss">See weight-care options</a>
            <p className={styles.legalCopy}>*Only available when prescribed after an independent clinical evaluation. Compounded medications are not FDA-approved. Results vary.</p>
          </div>
        </section>

        <section className={styles.faqSection} id="faq">
          <div className={styles.faqHeading}>
            <h2>The important questions, answered plainly</h2>
            <p>Understand the care relationship, clinical handoff, and payment timing before you begin.</p>
          </div>
          <Accordion type="single" collapsible className={styles.faqList}>
            {faqs.map(([question, answer], index) => (
              <AccordionItem key={question} value={`item-${index}`}>
                <AccordionTrigger>{question}</AccordionTrigger>
                <AccordionContent>{answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        <section className={styles.close}>
          <CalendarClock aria-hidden="true" />
          <h2>Begin when you’re ready</h2>
          <p>Starting takes a few minutes. Payment-method setup is $0 due, and treatment is never guaranteed.</p>
          <a className={styles.primaryButton} href={weightOnboardingHref}>See if online care fits</a>
        </section>
      </div>

      <Footer />
      </main>
    </>
  );
}
