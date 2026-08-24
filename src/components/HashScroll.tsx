"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    /** Set by the head script in layout.tsx before the body parses. */
    __apothPendingHash?: string;
  }
}

/**
 * Wait out the 200ms cross-fade in globals.css before moving, with margin.
 * Starting earlier scrolls the document while the transition overlay still
 * covers it, so the page appears to lurch once when the overlay lifts and
 * again as the scroll continues. The delay also hides the browser's own
 * fragment jump and the App Router's reset, which both land in this window.
 */
const START_DELAY_MS = 300;
/** Scroll duration bounds; longer journeys take longer, within reason. */
const MIN_DURATION_MS = 420;
const MAX_DURATION_MS = 900;
const PX_PER_MS = 3.2;

const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

function headerOffset() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(
    "--site-header-offset",
  );
  return Number.parseFloat(raw) || 0;
}

/**
 * Cross-page anchor links (`/weight-loss#how-it-works`) land at the top of the
 * target page: the App Router resets scroll position while hydrating, which
 * discards the browser's own jump to the fragment.
 *
 * Rather than teleport, let the page arrive and then scroll down to the
 * section, so the reader sees where they were taken.
 *
 * The animation is hand-rolled rather than `scrollIntoView({behavior:"smooth"})`
 * for two reasons: a native smooth scroll is cancelled outright by the
 * hydration reset we are correcting for, and writing the position every frame
 * lets us re-read the destination as late-loading images shift it.
 *
 * Same-page fragment links are unaffected and stay on the native path, which
 * `scroll-behavior: smooth` in globals.css already animates.
 */
export function HashScroll() {
  // Nav links point at the page that owns each section (`/weight-loss#how-it-works`),
  // which is right from elsewhere but reloads the whole document when the
  // current page has that section too — home has its own `#how-it-works`.
  // Scroll in place instead. Delegated so the mobile menu, which mounts on
  // open, is covered as well.
  useEffect(() => {
    const header = document.querySelector("header");
    if (!header) return;

    const onClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target) return;

      const url = new URL(anchor.href, window.location.href);
      if (!url.hash || url.origin !== window.location.origin) return;
      // Same path already scrolls without reloading; leave it to the browser.
      if (url.pathname === window.location.pathname) return;

      const target = document.getElementById(
        decodeURIComponent(url.hash.slice(1)),
      );
      if (!target) return;

      event.preventDefault();
      window.history.pushState(null, "", url.hash);
      // `auto` defers to `scroll-behavior`, which globals.css sets to smooth
      // and flattens under prefers-reduced-motion.
      target.scrollIntoView({ behavior: "auto", block: "start" });
    };

    header.addEventListener("click", onClick);
    return () => header.removeEventListener("click", onClick);
  }, []);

  useEffect(() => {
    // The head script in layout.tsx stashes the hash here and strips it from
    // the URL, so neither the browser nor the router scrolls before we do.
    // Falling back to location.hash keeps this working if that script is
    // blocked — the scroll may lurch, but it still reaches the section.
    const pendingHash = window.__apothPendingHash ?? window.location.hash;
    if (!pendingHash) return;

    const id = decodeURIComponent(pendingHash.slice(1));
    if (!id) return;

    // Cleared here rather than on read: React's dev StrictMode mounts, tears
    // down, then mounts again, and the second mount still needs to find the
    // hash somewhere.
    const restoreHash = () => {
      delete window.__apothPendingHash;
      if (window.location.hash === pendingHash) return;
      window.history.replaceState(null, "", pendingHash);
    };

    let active = true;
    let frame = 0;
    let timer = 0;

    const stop = () => {
      active = false;
      cancelAnimationFrame(frame);
      // Even when the reader takes over, the URL should name where they are.
      restoreHash();
    };

    // A deliberate scroll by the reader outranks moving them to the section.
    const interactions = ["wheel", "touchstart", "keydown"] as const;
    for (const event of interactions) {
      window.addEventListener(event, stop, { passive: true, once: true });
    }

    const destinationFor = (target: Element) =>
      Math.max(
        0,
        Math.min(
          target.getBoundingClientRect().top + window.scrollY - headerOffset(),
          document.documentElement.scrollHeight - window.innerHeight,
        ),
      );

    const run = () => {
      const target = document.getElementById(id);
      if (!active || !target) {
        restoreHash();
        return;
      }

      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;

      const from = window.scrollY;
      const distance = Math.abs(destinationFor(target) - from);
      if (distance < 2) {
        restoreHash();
        return;
      }

      if (reducedMotion) {
        window.scrollTo({ top: destinationFor(target), behavior: "instant" });
        restoreHash();
        return;
      }

      const duration = Math.min(
        MAX_DURATION_MS,
        Math.max(MIN_DURATION_MS, distance / PX_PER_MS),
      );
      const started = performance.now();
      // Fixed for the whole animation. Re-reading it each frame while easing
      // from a fixed origin makes the position jump discontinuously if the
      // destination moves — the images here sit in fixed-height containers and
      // do not reflow, so there is nothing to track and everything to lose.
      const to = destinationFor(target);

      const step = (now: number) => {
        if (!active) return;

        const progress = Math.min(1, (now - started) / duration);
        // `behavior: "instant"` overrides the global `scroll-behavior: smooth`,
        // which would otherwise animate every one of these per-frame writes.
        window.scrollTo({
          top: from + (to - from) * easeInOutCubic(progress),
          behavior: "instant",
        });

        if (progress < 1) frame = requestAnimationFrame(step);
        else restoreHash();
      };

      frame = requestAnimationFrame(step);
    };

    // A page opened in a background tab has its timers and frames suppressed,
    // so wait until it is actually on screen before moving anything.
    const start = () => {
      if (document.visibilityState !== "visible") return;
      document.removeEventListener("visibilitychange", start);
      timer = window.setTimeout(run, START_DELAY_MS);
    };

    if (document.visibilityState === "visible") {
      start();
    } else {
      document.addEventListener("visibilitychange", start);
    }

    return () => {
      stop();
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", start);
      for (const event of interactions) {
        window.removeEventListener(event, stop);
      }
    };
  }, []);

  return null;
}
