import { UserRound } from "lucide-react";

import { navLinks } from "@/lib/data";
import { checkoutHref } from "@/lib/public-commerce";
import { MobileMenu } from "@/components/marketing-v2/MobileMenu";
import { Wordmark } from "./Icons";

type NavProps = {
  variant?: "dark" | "light";
};

export function Nav({ variant = "light" }: NavProps) {
  const isDark = variant === "dark";

  return (
    <header
      className={`sticky top-0 z-50 border-b backdrop-blur-xl ${
        isDark
          ? "border-white/10 bg-[#171719]/95 text-white"
          : "border-black/[0.05] bg-[#f9f9fa]/95 text-[#171719]"
      }`}
    >
      <div className="mx-auto flex h-[62px] max-w-[1400px] items-center justify-between px-5 sm:h-[74px] lg:px-8">
        <a href="/" aria-label="Apoth home" className="transition-opacity hover:opacity-60">
          <Wordmark />
        </a>

        <nav aria-label="Primary" className="hidden lg:block">
          <ul className="flex items-center gap-10 text-sm font-semibold">
            {navLinks.map((link) => (
              <li key={link.href}>
                <a href={link.href} className="transition-opacity hover:opacity-55">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-3">
          <a
            href={checkoutHref("weight")}
            className={`hidden min-h-11 items-center justify-center rounded-full px-6 text-sm font-semibold transition-all hover:-translate-y-px sm:inline-flex ${
              isDark ? "bg-white text-[#171719] hover:bg-white/90" : "bg-[#171719] text-white hover:bg-[#343437]"
            }`}
          >
            Get started
          </a>
          <a
            href="/sign-in"
            className={`hidden min-h-11 items-center justify-center gap-2 rounded-full border px-5 text-sm font-medium transition-colors sm:inline-flex ${
              isDark
                ? "border-white/25 hover:bg-white/10"
                : "border-black/15 bg-white hover:bg-black/[0.04]"
            }`}
          >
            <UserRound className="h-4 w-4" aria-hidden="true" /> Login
          </a>
          <MobileMenu
            links={navLinks.map(({ label, href }) => [label, href] as const)}
            ctaHref={checkoutHref("weight")}
          />
        </div>
      </div>
    </header>
  );
}
