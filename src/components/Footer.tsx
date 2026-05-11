import Link from "next/link";
import { Wordmark } from "./Icons";

const productLinks = [
  { label: "What we treat", href: "#what-we-treat" },
  { label: "Pricing", href: "#pricing" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Clinicians", href: "#clinicians" },
];

const helpLinks = [
  { label: "FAQ", href: "#faq" },
  { label: "Contact", href: "mailto:hello@example.com" },
  { label: "State availability", href: "/states" },
  { label: "Refunds and cancellation", href: "/policies/cancellation" },
];

const legalLinks = [
  { label: "Terms of service", href: "/terms" },
  { label: "Privacy notice", href: "/privacy" },
  { label: "Telehealth disclosure", href: "/telehealth-disclosure" },
  { label: "Notice of privacy practices", href: "/hipaa" },
];

export function Footer() {
  return (
    <footer className="border-t border-ash-line bg-cream-warm pb-12 pt-20 text-ink md:pt-28">
      <div className="mx-auto max-w-page px-6 md:px-10">
        <div className="grid grid-cols-2 gap-y-12 md:grid-cols-12 md:gap-x-10">
          <div className="col-span-2 md:col-span-5">
            <Wordmark className="text-ink" />
            <p className="mt-5 max-w-prose text-pretty text-ink/75">
              Telehealth, made considered. We see adults in 28 states for
              sexual health, hair, weight, and physician-supervised peptide
              protocols.
            </p>
            <p className="mt-6 text-sm text-ash">
              hello@apothem.example · 1-800-555-0144
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

        <div className="mt-16 grid grid-cols-1 gap-y-4 border-t border-ash-line pt-8 text-xs text-ash md:grid-cols-12 md:gap-x-10">
          <p className="md:col-span-7 text-pretty">
            Apothem Health PBC operates as a corporate practice supporting
            independent clinicians. Medical services are provided by Apothem
            Medical PA and affiliates. Not all medications discussed are
            FDA-approved; investigational peptide protocols are dispensed only
            through licensed 503A compounding pharmacies under physician
            supervision.
          </p>
          <p className="md:col-span-3 md:text-right">
            NPI 0000000000 (placeholder)
          </p>
          <p className="md:col-span-2 md:text-right">© 2026 Apothem Health</p>
        </div>
      </div>
    </footer>
  );
}
