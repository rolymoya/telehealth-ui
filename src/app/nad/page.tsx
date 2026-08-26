import type { Metadata } from "next";
import { CalendarClock, ShieldCheck } from "lucide-react";

import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "NAD+ · Apoth",
  description:
    "NAD+ is not currently available through Apoth. This page describes how the offering will be presented once clinical and pricing details are finalized.",
  // Nothing here is final, so keep it out of search results for now.
  robots: { index: false, follow: true },
};

/** RULES.md: any user-visible value awaiting real data uses the TODO: chip. */
function Todo({ children }: { children?: React.ReactNode }) {
  return (
    <span className="font-mono uppercase tracking-eyebrow text-[0.72rem] text-clay-deep">
      TODO:{children ? ` ${children}` : ""}
    </span>
  );
}

const pending = [
  {
    title: "What the treatment is",
    body:
      "Formulation, route of administration, and whether the product is compounded. A compounded product carries the explicit not-FDA-approved badge used elsewhere on the site.",
  },
  {
    title: "Who it is appropriate for",
    body:
      "Clinical eligibility criteria, and the conditions under which an independent licensed provider would consider it. Apoth does not make this determination.",
  },
  {
    title: "What the plan includes",
    body:
      "What the monthly price covers, and when the first charge occurs relative to clinical approval and separate acceptance.",
  },
  {
    title: "Where it is available",
    body:
      "The states where licensure, clinical eligibility, and pharmacy shipping rules support this treatment.",
  },
];

export default function NadPage() {
  return (
    <>
      <Nav />
      <main id="main" className={`${styles.page} marketing-v2`}>
        <div id="main-content">
          <section className={styles.hero}>
            <div className={styles.heroMedia}>
              <p className="text-sm font-semibold text-[#171719]/70">
                <Todo>product imagery</Todo>
              </p>
            </div>

            <div className={styles.heroDetails}>
              <h1>NAD+</h1>
              <p className={styles.subtitle}>
                NAD+ is not currently available through Apoth. This page is a
                placeholder while the clinical and pricing details are settled.
              </p>

              <div className={styles.panel}>
                <p className={styles.reviewNote}>
                  <ShieldCheck aria-hidden="true" />
                  Any treatment offered through Apoth requires review by an
                  independent licensed provider. Apoth is a technology platform
                  and does not practice medicine or prescribe.
                </p>

                <div className={styles.rows}>
                  <div className={styles.row}>
                    <span>Plan price</span>
                    <strong>$179<small>/month*</small></strong>
                  </div>
                </div>

                <span aria-disabled="true" className={styles.waitlistButton}>
                  <CalendarClock aria-hidden="true" /> Not yet available
                </span>

                <p className={styles.microcopy}>
                  *Self-pay price. <Todo>plan inclusions</Todo> What the plan
                  covers is confirmed before this treatment is offered.
                  Enrollment is not open, and no subscription starts until
                  clinical approval and your separate acceptance of the exact
                  treatment and recurring price.
                </p>
              </div>
            </div>
          </section>

          <section className={styles.section} id="details">
            <h2>What still has to be confirmed</h2>
            <p>
              We would rather show nothing than show a number or a clinical
              claim that has not been reviewed. Each item below is filled in
              before this treatment is offered.
            </p>

            <div className={styles.pending}>
              {pending.map(({ title, body }) => (
                <div className={styles.pendingRow} key={title}>
                  <h3>{title}</h3>
                  <p><Todo /> {body}</p>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.safety} id="safety">
            <div className={styles.safetyInner}>
              <h2>Important information</h2>
              <p>
                Apoth Health LLC is a technology platform. It is not a medical
                provider, does not practice medicine, and does not make clinical
                decisions about your care. Treatment is provided by independent
                licensed clinicians, and medication, where prescribed, is
                dispensed by a licensed pharmacy partner.
              </p>
              <p>
                <Todo>safety and product disclosures</Todo> Product-specific
                risk, side-effect, and compounding disclosures will be listed
                here, reviewed by counsel, before this treatment is offered.
              </p>
            </div>
          </section>
        </div>

        <Footer />
      </main>
    </>
  );
}
