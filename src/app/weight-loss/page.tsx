import type { Metadata } from "next";
import Image from "next/image";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Check,
  CircleCheck,
  HeartHandshake,
  PackageCheck,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import { MobileMenu } from "@/components/marketing-v2/MobileMenu";
import { onboardingHref } from "@/lib/public-commerce";

import styles from "./page.module.css";

const weightOnboardingHref = onboardingHref("weight");

export const metadata: Metadata = {
  title: "Personalized GLP-1 Treatments | Apoth",
  description:
    "Provider-led weight management with personalized GLP-1 treatment options, ongoing support, and free expedited shipping.",
};

const quickFaqs = [
  {
    question: "What’s included with my plan?",
    answer:
      "Your plan includes an online health evaluation, a personalized care plan from a licensed provider, ongoing clinical messaging, and medication delivery when prescribed.",
  },
  {
    question: "What treatment options are available?",
    answer:
      "Licensed providers may consider compounded semaglutide or tirzepatide based on your health history, goals, state, and clinical eligibility.",
  },
  {
    question: "What if I need to cancel?",
    answer:
      "There are no long-term contracts. You can pause or cancel before your next renewal from your account.",
  },
];

const plans = [
  {
    title: "Personalized GLP-1\nInjections",
    price: "See which plan fits",
    featured: true,
  },
  {
    title: "Compounded Semaglutide",
    price: "$99/mo*",
    featured: false,
  },
  {
    title: "Compounded Tirzepatide",
    price: "$199/mo*",
    featured: false,
  },
];

const howItWorksSteps = [
  {
    title: "Sign up",
    copy: "Complete a brief online intake and tell us about your health, history, and weight loss goals.",
    disclaimer: "Medication and care are included in the plan price, if prescribed.",
  },
  {
    title: "Provider evaluation",
    copy: "A licensed provider reviews your intake and determines what’s appropriate for you.",
  },
  {
    title: "Personalized plan",
    copy: "If prescribed, receive a tailored treatment plan designed around your goals, with ongoing clinical support.",
  },
  {
    title: "Start your plan",
    copy: "If treatment is prescribed, the pharmacy prepares it for discreet delivery and your provider remains available for follow-up.",
  },
];

const faqs = [
  ...quickFaqs,
  {
    question: "How do GLP-1 treatments support weight management?",
    answer:
      "GLP-1 medicines can help regulate appetite and blood sugar. A licensed provider will determine whether a treatment is appropriate for your individual health profile.",
  },
  {
    question: "What is compounded medication?",
    answer:
      "Compounded medications are prepared by licensed pharmacies for an individual patient based on a provider’s prescription. They are not reviewed or approved by the FDA for safety or effectiveness.",
  },
  {
    question: "Can my provider adjust my medication or dosage?",
    answer:
      "Yes. Your provider can review your progress and make clinically appropriate adjustments. Your care team is available for questions throughout your plan.",
  },
  {
    question: "Can I qualify if I have an existing health condition?",
    answer:
      "Eligibility is individual. A licensed provider will review your full health history and determine whether treatment is safe and appropriate for you.",
  },
  {
    question: "Is a long-term commitment necessary?",
    answer:
      "No. Apoth plans are flexible and can be paused or canceled before your next renewal. Consistency matters, so discuss any treatment changes with your care team.",
  },
];

const footerGroups = [
  {
    heading: "Care",
    links: [
      { label: "GLP-1 treatments", href: "/weight-loss" },
      { label: "Weight management", href: "/weight-loss" },
      { label: "Start a visit", href: weightOnboardingHref },
      { label: "Patient login", href: "/sign-in" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About Apoth", href: "/about" },
      { label: "How it works", href: "#how-it-works" },
      { label: "FAQs", href: "#faq" },
      { label: "Contact", href: "/about#contact" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Terms of service", href: "/terms" },
      { label: "Privacy policy", href: "/privacy" },
      { label: "Telehealth disclosure", href: "/terms#telehealth-disclosure" },
      { label: "Notice of privacy practices", href: "/privacy#notice-of-privacy-practices" },
    ],
  },
] as const;

function ActionButtons({ compact = false }: { compact?: boolean }) {
  return (
    <div className={styles.actions} data-compact={compact ? "true" : "false"}>
      <a className={styles.primaryButton} href={weightOnboardingHref}>
        Get started
      </a>
      <a className={styles.secondaryButton} href={weightOnboardingHref}>
        See if you’re eligible
      </a>
    </div>
  );
}

function AccordionRow({ question, answer }: { question: string; answer: string }) {
  return (
    <details className={styles.accordionRow}>
      <summary>
        <span>{question}</span>
        <span className={styles.accordionIcon} aria-hidden="true" />
      </summary>
      <p>{answer}</p>
    </details>
  );
}

export default function WeightLossPage() {
  return (
    <main id="main" className={styles.page}>
      <a className={styles.skipLink} href="#main-content">
        Skip to main content
      </a>

      <header className={styles.header}>
        <div className={styles.headerInner}>
          <a className={styles.logo} href="/" aria-label="Apoth home">
            apoth
          </a>
          <nav className={styles.nav} aria-label="Primary navigation">
            <a href="#treatments">Weight Loss</a>
            <a href="#how-it-works">How it works</a>
            <a href="#faq">FAQs</a>
            <a href="/about">About</a>
          </nav>
          <div className={styles.headerActions}>
            <a className={styles.headerCta} href={weightOnboardingHref}>
              Get started
            </a>
            <a className={styles.loginButton} href="/sign-in">
              <UserRound aria-hidden="true" /> Login
            </a>
            <MobileMenu
              links={[
                ["Weight Loss", "#treatments"],
                ["How it works", "#how-it-works"],
                ["FAQs", "#faq"],
              ]}
              ctaHref={weightOnboardingHref}
            />
          </div>
        </div>
      </header>

      <div id="main-content">
        <section className={styles.hero} id="product">
          <div className={styles.heroInner}>
            <div className={styles.heroVisual}>
              <Image
                src="/images/apoth-weight-loss-hero.webp"
                alt="Unbranded weight management treatment vial and injector pens"
                fill
                priority
                sizes="(min-width: 1000px) 50vw, 94vw"
                className={styles.heroImage}
              />
              <span className={styles.stockPill}>
                <span /> In stock
              </span>
            </div>

            <div className={styles.heroDetails}>
              <h1><span>Personalized</span><span>GLP-1 Treatments</span></h1>
              <p className={styles.heroSubtitle}>A provider-led weight loss plan built around you</p>

              <div className={styles.pricingPanel}>
                <div className={styles.priceGrid}>
                  <div className={styles.priceOption}>
                    <span>Compounded<br />Semaglutide</span>
                    <strong>$99<small>/mo</small></strong>
                    <em>care included*</em>
                  </div>
                  <div className={styles.priceOption}>
                    <span>Compounded<br />Tirzepatide</span>
                    <strong>$199<small>/mo</small></strong>
                    <em>care included*</em>
                  </div>
                </div>
                <div className={styles.payLater}>
                  <span>Simple monthly pricing</span>
                </div>
                <a className={styles.wideButton} href={weightOnboardingHref}>Get started</a>
                <p className={styles.microcopy}>
                  *Self-pay price includes clinical care, standard injection supplies, medication, and expedited shipping only if prescribed. Due before intake: $0. Plans renew monthly after you accept the exact approved treatment and price. Labs, if separately required, are not included. No insurance required.
                </p>
              </div>

              <div className={styles.benefitsPanel}>
                <div className={styles.segmentedControl} aria-label="Plan overview">
                  <span>Benefits</span>
                  <span>What’s included</span>
                </div>
                <ul className={styles.benefitList}>
                  <li><ShieldCheck /> Same price at every dose</li>
                  <li><PackageCheck /> Free expedited shipping</li>
                  <li><CircleCheck /> No long-term contracts</li>
                  <li><HeartHandshake /> Provider-led plans and ongoing support</li>
                </ul>
                <div className={styles.benefitFoot}>
                  <span><BadgeCheck /> Compounded in the U.S.A.</span>
                </div>
              </div>

              <div className={styles.quickFaqs}>
                {quickFaqs.map((faq) => <AccordionRow key={faq.question} {...faq} />)}
              </div>

              <div className={styles.trustRow} aria-label="Apoth care workflow">
                <strong>Secure intake</strong>
                <span aria-hidden="true">•</span>
                <span>Independent licensed providers</span>
              </div>

              <div className={styles.heroLegal}>
                <p>The statements on this page have not been evaluated by the Food and Drug Administration. Compounded medications are not FDA-approved.</p>
                <a href="#safety">Important safety information</a>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.treatments} id="treatments">
          <div className={styles.sectionInner}>
            <div className={styles.sectionHeading}>
              <h2>Medication made affordable</h2>
              <p>Without the need for insurance</p>
            </div>

            <div className={styles.treatmentGrid}>
              {plans.map((plan, index) => (
                <article
                  className={`${styles.treatmentCard} ${plan.featured ? styles.featuredTreatment : ""}`}
                  key={plan.title}
                >
                  <h3>{plan.title.split("\n").map((line) => <span key={line}>{line}</span>)}</h3>
                  <p>{plan.price}</p>
                  {plan.featured ? (
                    <Image
                      src="/images/apoth-weight-loss-hero.webp"
                      alt="GLP-1 treatment options"
                      fill
                      sizes="(min-width: 900px) 30vw, 88vw"
                      className={styles.treatmentHeroImage}
                    />
                  ) : (
                    <div className={`${styles.vialWrap} ${index === 2 ? styles.vialLime : ""}`}>
                      <Image
                        src="/images/weight-loss-vial.webp"
                        alt="Unbranded compounded medication vial"
                        fill
                        sizes="(min-width: 900px) 20vw, 70vw"
                        className={styles.vialImage}
                      />
                    </div>
                  )}
                  {plan.featured ? (
                    <a className={styles.cardButton} href={weightOnboardingHref}>See if you qualify</a>
                  ) : (
                    <a className={styles.safetyLink} href="#safety">Important safety information</a>
                  )}
                </article>
              ))}
            </div>

            <div className={styles.treatmentFinePrint}>
              <p>*Self-pay price includes clinical care, standard supplies, medication, and expedited shipping only when prescribed. Labs, if separately required, are not included. Plans renew monthly only after you accept the exact treatment and price, and may be canceled before the next renewal.</p>
              <p>Apoth connects patients with licensed medical providers and state-licensed pharmacies. The FDA does not review compounded medications for safety or effectiveness. Results vary. Actual product packaging may differ.</p>
            </div>
            <div className={styles.carouselButtons} aria-hidden="true">
              <span><ArrowLeft /></span><span><ArrowRight /></span>
            </div>
          </div>
        </section>

        <section className={styles.howItWorks} id="how-it-works">
          <div className={styles.howItWorksCard}>
            <div className={styles.howItWorksInner}>
              <div className={styles.howItWorksMedia}>
                <Image
                  className={styles.howItWorksImage}
                  src="/images/how-it-works-member.webp"
                  alt="A member checking her care plan on her phone"
                  fill
                  sizes="(min-width: 768px) 45vw, calc(100vw - 44px)"
                />
              </div>

              <div className={styles.howItWorksContent}>
                <h2>How it works</h2>
                <ol className={styles.howItWorksSteps}>
                  {howItWorksSteps.map((step, index) => (
                    <li className={styles.howItWorksStep} key={step.title}>
                      <span className={styles.stepNumber} aria-hidden="true">{index + 1}</span>
                      <div className={styles.stepText}>
                        <h3 className={styles.stepTitle}>{step.title}</h3>
                        <p className={styles.stepDescription}>{step.copy}</p>
                        {step.disclaimer ? <p className={styles.stepDisclaimer}>{step.disclaimer}</p> : null}
                      </div>
                    </li>
                  ))}
                </ol>
                <a className={styles.howItWorksButton} href={weightOnboardingHref}>Start a visit</a>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.medicalJourney}>
          <div className={styles.journeyVisual} aria-hidden="true">
            <Image src="/images/weight-loss-syringe.webp" alt="" fill sizes="40vw" className={styles.journeyPen} />
            <Image src="/images/weight-loss-vial.webp" alt="" fill sizes="30vw" className={styles.journeyVial} />
          </div>
          <div className={styles.journeyCopy}>
            <h2>Begin your provider-led journey today</h2>
            <ul>
              <li><Check /> 1-on-1 guidance from U.S.-licensed providers</li>
              <li><Check /> Ongoing consultations to optimize treatment</li>
              <li><Check /> Fast, discreet delivery and responsive support</li>
            </ul>
            <a className={styles.primaryButton} href={weightOnboardingHref}>Get started</a>
          </div>
        </section>

        <section className={styles.faqSection} id="faq">
          <div className={styles.faqInner}>
            <h2>Learn more about<br />GLP-1 Treatments</h2>
            <div className={styles.faqList}>
              {faqs.map((faq) => <AccordionRow key={faq.question} {...faq} />)}
            </div>
          </div>
        </section>

        <section className={styles.getStarted} id="get-started">
          <div className={styles.getStartedCard}>
            <div>
              <p className={styles.eyebrow}>Personalized care. Straightforward pricing.</p>
              <h2>GLP-1 Treatments</h2>
              <p className={styles.startPrice}>From $99/month*</p>
              <ul>
                <li><Check /> No long-term contracts</li>
                <li><Check /> Personalized plans</li>
                <li><Check /> On-demand medical support</li>
                <li><Check /> Free expedited shipping</li>
              </ul>
              <ActionButtons compact />
              <p className={styles.microcopy}>*Available only when prescribed after an online consultation. Medication and clinical care are included in the displayed plan price.</p>
            </div>
            <div className={styles.startArt} aria-hidden="true">
              <span>apoth</span>
              <Image src="/images/weight-loss-syringe.webp" alt="" fill sizes="35vw" />
            </div>
          </div>
          <div className={styles.disclaimer} id="safety">
            <strong>Disclaimer</strong>
            <p>Only available if prescribed after an online consultation with a healthcare provider. Benefits described are based on published evidence and individual treatment plans. Plans may be canceled before the next renewal. Actual packaging may differ. The FDA does not review compounded medications for safety or effectiveness. Results vary. Contact your healthcare provider if you experience side effects.</p>
          </div>
        </section>
      </div>

      <footer className={styles.footer} id="footer">
        <div className={styles.footerInner}>
          <div className={styles.footerTop}>
            <div className={styles.footerSignup}>
              <a className={styles.footerLogo} href="/">apoth</a>
              <p>Start a visit or return to your patient account.</p>
              <div className={styles.footerActions}>
                <a href={weightOnboardingHref}>Start a visit</a>
                <a href="/sign-in">Patient login</a>
              </div>
              <small>Apoth is a technology platform, not a medical provider.</small>
            </div>
            <div className={styles.footerLinks}>
              {footerGroups.map((group) => (
                <div key={group.heading}>
                  <strong>{group.heading}</strong>
                  <ul>
                    {group.links.map((link) => (
                      <li key={link.href}><a href={link.href}>{link.label}</a></li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.footerSocial}>
            <div><a href="/terms">Terms</a><a href="/privacy">Privacy</a></div>
            <span><PackageCheck /> Compounded<br />in the U.S.A.</span>
          </div>

          <div className={styles.footerLegal}>
            <p><strong>Prescription process:</strong> Online evaluations with independent licensed medical professionals determine prescription appropriateness. Providers may prescribe FDA-approved or compounded medications based on patient needs and clinical judgment.</p>
            <p><strong>Medication access:</strong> If eligible after provider consultation, prescriptions may be filled by a network pharmacy. Product packaging may differ from images shown. You consent to Apoth using your information in accordance with our Privacy Policy.</p>
            <p><strong>Pricing:</strong> Displayed prices are subject to plan terms. Accessibility feedback may be sent to care@apoth.com.</p>
          </div>
        </div>
        <div className={styles.copyright}>© 2026 Apoth Health LLC. All rights reserved.</div>
      </footer>
    </main>
  );
}
