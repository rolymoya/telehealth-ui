"use client";

import { useEffect } from "react";

export function MotionObserver() {
  useEffect(() => {
    const root = document.documentElement;
    const elements = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    const completionTimers: number[] = [];
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    root.classList.add("motion-ready");

    if (reducedMotion || !("IntersectionObserver" in window)) {
      elements.forEach((element) => {
        element.setAttribute("data-revealed", "true");
        element.setAttribute("data-reveal-complete", "true");
      });
      return () => root.classList.remove("motion-ready");
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const element = entry.target as HTMLElement;
          const delay = Number(element.dataset.revealDelay ?? 0);
          element.style.setProperty("--reveal-delay", `${delay}ms`);
          element.setAttribute("data-revealed", "true");
          completionTimers.push(window.setTimeout(() => element.setAttribute("data-reveal-complete", "true"), 700 + delay));
          observer.unobserve(element);
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );

    elements.forEach((element) => observer.observe(element));

    return () => {
      observer.disconnect();
      completionTimers.forEach((timer) => window.clearTimeout(timer));
      root.classList.remove("motion-ready");
    };
  }, []);

  return null;
}
