"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { NavLink } from "@/lib/data";
import styles from "./Nav.module.css";

type NavMenuProps = {
  label: string;
  items: readonly NavLink[];
};

/**
 * Disclosure menu for a nav group. Opens on click and on ArrowUp/ArrowDown
 * rather than hover: hover menus are unreachable by keyboard and awkward on
 * touch, and this is the site's first menu pattern so there is nothing to
 * stay consistent with.
 */
export function NavMenu({ label, items }: NavMenuProps) {
  const [open, setOpen] = useState(false);
  // Focus is applied in an effect rather than straight after setOpen, because
  // the items are not mounted until the open render commits.
  const [focusIndex, setFocusIndex] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);

  const close = (returnFocus: boolean) => {
    setOpen(false);
    setFocusIndex(null);
    if (returnFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open || focusIndex === null) return;
    itemRefs.current[focusIndex]?.focus();
  }, [open, focusIndex]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) close(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(true);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const openAt = (index: number) => {
    setOpen(true);
    setFocusIndex(index);
  };

  return (
    <div className={styles.menuWrap} ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="true"
        className={open ? `${styles.menuTrigger} ${styles.menuTriggerOpen}` : styles.menuTrigger}
        onClick={() => (open ? close(false) : setOpen(true))}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            openAt(0);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            openAt(items.length - 1);
          }
        }}
        ref={triggerRef}
        type="button"
      >
        {label}
        <ChevronDown aria-hidden="true" />
      </button>

      {open ? (
        <ul className={styles.menuPanel}>
          {items.map((item, index) => (
            <li key={item.href}>
              <a
                href={item.href}
                onClick={() => close(false)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setFocusIndex((index + 1) % items.length);
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setFocusIndex((index - 1 + items.length) % items.length);
                  } else if (event.key === "Tab" && !event.shiftKey && index === items.length - 1) {
                    close(false);
                  }
                }}
                ref={(element) => {
                  itemRefs.current[index] = element;
                }}
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
