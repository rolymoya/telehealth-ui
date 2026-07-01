import { navLinks } from "@/lib/data";
import { Wordmark } from "./Icons";

type NavProps = {
  variant?: "dark" | "light";
};

export function Nav({ variant = "dark" }: NavProps) {
  const isDark = variant === "dark";

  const wordmarkClass = isDark
    ? "text-cream transition-opacity duration-250 ease-out-quart hover:opacity-80"
    : "text-ink transition-opacity duration-250 ease-out-quart hover:opacity-80";

  const linkClass = isDark
    ? "text-[0.95rem] text-cream/90 transition-colors duration-250 ease-out-quart hover:text-cream"
    : "text-[0.95rem] text-ink/80 transition-colors duration-250 ease-out-quart hover:text-clay-deep";

  const ctaClass = isDark
    ? "rounded-full bg-cream px-5 py-2.5 text-[0.95rem] font-medium text-clay-deep transition-all duration-250 ease-out-quart hover:bg-cream-warm hover:text-ink"
    : "rounded-full bg-clay-deep px-5 py-2.5 text-[0.95rem] font-medium text-cream transition-all duration-250 ease-out-quart hover:bg-clay";

  return (
    <header className="relative z-10">
      <div className="mx-auto flex max-w-page items-center justify-between px-6 pt-7 md:px-10 md:pt-9">
        <a href="/" aria-label="Apoth home" className={wordmarkClass}>
          <Wordmark />
        </a>

        <nav aria-label="Primary" className="hidden md:block">
          <ul className="flex items-center gap-9">
            {navLinks.map((link) => (
              <li key={link.href}>
                <a href={link.href} className={linkClass}>
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <a href="/get-started" className={ctaClass}>
          Start a visit
        </a>
      </div>
    </header>
  );
}
