import Link from "next/link";
import { navLinks } from "@/lib/data";
import { Wordmark } from "./Icons";

export function Nav() {
  return (
    <header className="relative z-10">
      <div className="mx-auto flex max-w-page items-center justify-between px-6 pt-7 md:px-10 md:pt-9">
        <Link
          href="/"
          aria-label="Apothem home"
          className="text-cream transition-opacity duration-250 ease-out-quart hover:opacity-80"
        >
          <Wordmark />
        </Link>

        <nav aria-label="Primary" className="hidden md:block">
          <ul className="flex items-center gap-9">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-[0.95rem] text-cream/90 transition-colors duration-250 ease-out-quart hover:text-cream"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <Link
          href="/get-started"
          className="rounded-full bg-cream px-5 py-2.5 text-[0.95rem] font-medium text-clay-deep transition-all duration-250 ease-out-quart hover:bg-cream-warm hover:text-ink"
        >
          Start a visit
        </Link>
      </div>
    </header>
  );
}
