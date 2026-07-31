import { PackageCheck } from "lucide-react";

import { Wordmark } from "./Icons";
import { checkoutHref } from "@/lib/public-commerce";

const weightCheckoutHref = checkoutHref("weight");

const footerGroups = [
  {
    heading: "Care",
    links: [
      { label: "GLP-1 treatments", href: "/weight-loss" },
      { label: "Start a visit", href: weightCheckoutHref },
      { label: "Patient login", href: "/sign-in" },
      { label: "Patient dashboard", href: "/dashboard" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About Apoth", href: "/about" },
      { label: "How it works", href: "/weight-loss#how-it-works" },
      { label: "FAQs", href: "/#faq" },
      { label: "Contact", href: "/about#contact" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Terms of service", href: "/terms" },
      { label: "Privacy policy", href: "/privacy" },
      { label: "Telehealth disclosure", href: "/terms#telehealth-disclosure" },
      { label: "Privacy practices", href: "/privacy#notice-of-privacy-practices" },
    ],
  },
] as const;

export function Footer() {
  return (
    <footer className="bg-[#1e1e20] px-5 py-16 text-white lg:px-8">
      <div className="mx-auto max-w-[1270px]">
        <div className="grid gap-12 md:grid-cols-[1.2fr_2fr]">
          <div>
            <Wordmark className="text-white" />
            <p className="mt-6 max-w-sm text-sm leading-6 text-white/60">
              A technology platform for online intake, account access, billing,
              and independent provider care workflows.
            </p>
            <p className="mt-3 max-w-sm text-xs leading-5 text-white/45">
              Care is available where licensure, clinical eligibility, and
              pharmacy shipping rules support care.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a className="inline-flex min-h-10 items-center rounded-full bg-white px-5 text-xs font-semibold text-[#171719] hover:bg-white/90" href={weightCheckoutHref}>
                Start a visit
              </a>
              <a className="inline-flex min-h-10 items-center rounded-full border border-white/25 px-5 text-xs font-semibold hover:bg-white/10" href="/sign-in">
                Patient login
              </a>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 text-sm sm:grid-cols-3">
            {footerGroups.map((group) => (
              <nav aria-label={group.heading} key={group.heading}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/35">
                  {group.heading}
                </p>
                <ul className="mt-5 space-y-3 text-white/60">
                  {group.links.map((link) => (
                    <li key={link.href}>
                      <a className="transition-colors hover:text-white" href={link.href}>
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        <div className="mt-14 border-t border-white/10 pt-7 text-[11px] leading-5 text-white/40">
          <p>
            Apoth Health LLC is a technology platform, not a medical provider.
            Clinical decisions are made by independent licensed clinicians of MD
            Integrations and affiliates. Medication is dispensed by a separate
            licensed pharmacy partner when prescribed.
          </p>
          <p className="mt-3">
            Compounded semaglutide and compounded tirzepatide are not FDA-approved.
            The FDA has not evaluated compounded medications for safety, efficacy,
            or quality. Treatment requires an independent clinical evaluation.
            Results vary.
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-5 text-[11px] text-white/35 sm:flex-row sm:items-center sm:justify-between">
          <span>© 2026 Apoth Health LLC. All rights reserved.</span>
          <span className="flex items-center gap-2">
            <PackageCheck className="h-4 w-4" aria-hidden="true" /> Prepared by a licensed U.S. pharmacy
          </span>
        </div>
      </div>
    </footer>
  );
}
