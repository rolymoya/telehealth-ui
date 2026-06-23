import Link from "next/link";
import { Wordmark } from "./Icons";

const productLinks = [
  { label: "What we treat", href: "/#what-we-treat" },
  { label: "Pricing", href: "/#pricing" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "Clinicians", href: "/#clinicians" },
];

const helpLinks = [
  { label: "FAQ", href: "/#faq" },
  { label: "About", href: "/about" },
  { label: "State availability", href: "/about#states" },
  { label: "Contact", href: "/about#contact" },
];

const legalLinks = [
  { label: "Terms of service", href: "/terms" },
  { label: "Telehealth disclosure", href: "/terms#telehealth-disclosure" },
  { label: "Refunds and cancellation", href: "/terms#refunds-and-cancellation" },
  { label: "Privacy policy", href: "/privacy" },
  { label: "Notice of privacy practices", href: "/privacy#notice-of-privacy-practices" },
];

export function Footer() {
  return (
    <footer className="border-t border-ash-line bg-cream-warm pb-12 pt-20 text-ink md:pt-28">
      <div className="mx-auto max-w-page px-6 md:px-10">
        <div className="grid grid-cols-2 gap-y-12 md:grid-cols-12 md:gap-x-10">
          <div className="col-span-2 md:col-span-5">
            <Wordmark className="text-ink" />
            <p className="mt-5 max-w-prose text-pretty text-ink/75">
              Real visits and named clinicians, where licensure, clinical
              eligibility, and pharmacy shipping rules support care. We see
              adults for sexual health, hair, weight, and
              physician-supervised peptide protocols.
            </p>
            <p className="mt-6 text-sm text-ash">
              hello@apoth.example · 1-800-555-0144
            </p>
          </div>

          <nav aria-label="Site" className="md:col-span-3">
            <p className="text-eyebrow uppercase text-ash">Care</p>
            <ul className="mt-4 space-y-2.5">
              {productLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-[0.95rem] text-ink/85 transition-colors duration-200 hover:text-clay-deep"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Help" className="md:col-span-2">
            <p className="text-eyebrow uppercase text-ash">Help</p>
            <ul className="mt-4 space-y-2.5">
              {helpLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-[0.95rem] text-ink/85 transition-colors duration-200 hover:text-clay-deep"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Legal" className="md:col-span-2">
            <p className="text-eyebrow uppercase text-ash">Legal</p>
            <ul className="mt-4 space-y-2.5">
              {legalLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-[0.95rem] text-ink/85 transition-colors duration-200 hover:text-clay-deep"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-y-6 border-t border-ash-line pt-8 text-xs text-ash md:grid-cols-12 md:gap-x-10">
          <div className="md:col-span-9 space-y-3 text-pretty">
            <p>
              Apoth Health LLC is a technology platform. It operates the
              account, intake, billing, support, and minimal linkage layer; it
              is not a medical provider and does not practice medicine.
              Clinical decisions are made solely by independent licensed
              clinicians of MD Integrations and affiliates. Medications are
              dispensed by licensed pharmacy partners that are separate legal
              entities from Apoth Health LLC.
            </p>
            <p>
              Compounded medications referenced on this site — including
              compounded semaglutide, compounded tirzepatide, BPC-157, and
              retatrutide — are not FDA-approved. The FDA has not evaluated
              them for safety, efficacy, or quality. Compounded medications are
              prepared by a licensed 503A compounding pharmacy partner under a
              valid prescription from a clinician licensed in the patient&apos;s
              state. Treatment requires a prescription from an independent
              licensed clinician based on a clinical evaluation. Individual
              results vary and are not guaranteed. This site is not medical
              advice; if you have a medical emergency, call 911.
            </p>
          </div>
          <div className="md:col-span-3 md:text-right space-y-2">
            <p>NPI 0000000000 (TODO: real NPI)</p>
            <p>© 2026 Apoth Health LLC</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
