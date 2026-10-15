import { PackageCheck, UserRound } from "lucide-react";

import { isNavGroup, navLinks } from "@/lib/data";
import { weightOffer } from "@/lib/product-availability";
import { MobileMenu } from "@/components/marketing-v2/MobileMenu";
import { NavMenu } from "@/components/NavMenu";
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
  ctaHref,
  ctaLabel,
  announcement = true,
}: NavProps) {
  const isDark = variant === "dark";
  // Falls back to whatever the launch mode offers, so no caller has to know
  // whether the site is selling yet.
  const offer = weightOffer();
  const href = ctaHref ?? offer.href;
  const label = ctaLabel ?? offer.ctaLabel;

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
            {navLinks.map((item) =>
              isNavGroup(item)
                ? (
                  <NavMenu
                    key={item.label}
                    items={item.children}
                    label={item.label}
                  />
                )
                : (
                  <a key={item.href} href={item.href}>
                    {item.label}
                  </a>
                )
            )}
          </nav>

          <div className={styles.headerActions}>
            <a className={styles.cta} href={href}>
              {label}
            </a>
            <a className={styles.login} href="/sign-in">
              <UserRound aria-hidden="true" /> Login
            </a>
            <MobileMenu ctaHref={href} ctaLabel={label} />
          </div>
        </div>
      </header>
    </>
  );
}
