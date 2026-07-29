"use client";

import type { CSSProperties, PointerEvent, ReactNode } from "react";

import { cn } from "@/lib/utils";

type InteractiveCardProps = {
  children: ReactNode;
  className?: string;
  href?: string;
  ariaLabel?: string;
  glow?: "light" | "dark";
  revealDelay?: number;
};

type MotionStyle = CSSProperties & {
  "--pointer-x": string;
  "--pointer-y": string;
  "--sheen-x": string;
  "--sheen-y": string;
};

export function InteractiveCard({
  children,
  className,
  href,
  ariaLabel,
  glow = "dark",
  revealDelay = 0,
}: InteractiveCardProps) {
  function updatePointer(event: PointerEvent<HTMLElement>) {
    if (event.pointerType === "touch") return;

    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;

    event.currentTarget.style.setProperty("--pointer-x", `${x * 100}%`);
    event.currentTarget.style.setProperty("--pointer-y", `${y * 100}%`);
    event.currentTarget.style.setProperty("--sheen-x", `${(x - 0.5) * 18}px`);
    event.currentTarget.style.setProperty("--sheen-y", `${(y - 0.5) * 10}px`);
  }

  function resetPointer(event: PointerEvent<HTMLElement>) {
    event.currentTarget.style.setProperty("--pointer-x", "50%");
    event.currentTarget.style.setProperty("--pointer-y", "50%");
    event.currentTarget.style.setProperty("--sheen-x", "0px");
    event.currentTarget.style.setProperty("--sheen-y", "0px");
  }

  const sharedProps = {
    "data-interactive-card": "",
    "data-reveal": "",
    "data-reveal-delay": revealDelay,
    onPointerMove: updatePointer,
    onPointerLeave: resetPointer,
    className: cn("interactive-card group", glow === "light" ? "card-glow-light" : "card-glow-dark", className),
    style: {
      "--pointer-x": "50%",
      "--pointer-y": "50%",
      "--sheen-x": "0px",
      "--sheen-y": "0px",
    } as MotionStyle,
  };

  if (href) {
    return (
      <a href={href} aria-label={ariaLabel} {...sharedProps}>
        {children}
      </a>
    );
  }

  return <article {...sharedProps}>{children}</article>;
}
