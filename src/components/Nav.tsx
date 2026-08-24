import { PackageCheck, UserRound } from "lucide-react";

import { navLinks } from "@/lib/data";
import { onboardingHref } from "@/lib/public-commerce";
import { MobileMenu } from "@/components/marketing-v2/MobileMenu";
import styles from "./Nav.module.css";

type NavProps = {
  variant?: "dark" | "light";
  /** Page-specific call to action. Defaults to the site-wide weight entry. */
  ctaHref?: string;
  ctaLabel?: string;
  /** Marketing promo bar. Off for authenticated surfaces. */
  announcement?: boolean;
};

export function Nav({
  variant = "light",
  ctaHref = onboardingHref("weight"),
  ctaLabel = "See if online care fits",
  announcement = true,
}: NavProps) {
  const isDark = variant === "dark";

  return (
    <>
      {/* These names are set inline rather than in Nav.module.css so CSS
          Modules does not rewrite them to hashed values; globals.css matches
          them by name to hold the header still across page transitions. */}
      {announcement ? (
        <div
          className={styles.announcement}
          style={{ viewTransitionName: "site-announcement" }}
        >
          <PackageCheck aria-hidden="true" />
          Free expedited shipping on prescribed treatment
        </div>
      ) : null}

      <header
        className={isDark ? `${styles.header} ${styles.dark}` : styles.header}
        style={{ viewTransitionName: "site-header" }}
      >
        <div className={styles.headerInner}>
          <a className={styles.wordmark} href="/" aria-label="Apoth home">
            apoth
          </a>

          <nav className={styles.nav} aria-label="Primary navigation">
            {navLinks.map((link) => (
              <a key={link.href} href={link.href}>
                {link.label}
              </a>
            ))}
          </nav>

          <div className={styles.headerActions}>
            <a className={styles.cta} href={ctaHref}>
              {ctaLabel}
            </a>
            <a className={styles.login} href="/sign-in">
              <UserRound aria-hidden="true" /> Login
            </a>
            <MobileMenu ctaHref={ctaHref} ctaLabel={ctaLabel} />
          </div>
        </div>
      </header>
    </>
  );
}
