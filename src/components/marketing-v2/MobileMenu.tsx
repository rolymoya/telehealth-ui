"use client";

import { ArrowUpRight, Menu, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/marketing-v2/ui/Button";
import { isNavGroup, navLinks } from "@/lib/data";
import { onboardingHref } from "@/lib/public-commerce";

type MobileMenuProps = {
  ctaHref?: string;
  ctaLabel?: string;
};

export function MobileMenu({
  ctaHref = onboardingHref("weight"),
  ctaLabel = "See if online care fits",
}: MobileMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="lg:hidden">
      <Button
        variant="ghost"
        size="icon"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>
      {open ? (
        <div className="absolute left-0 right-0 top-full border-t border-black/[0.05] bg-[#f9f9fa] p-5 shadow-soft">
          <nav className="grid gap-1" aria-label="Mobile navigation">
            {navLinks.map((item) =>
              isNavGroup(item)
                ? (
                  // Groups flatten into a labelled section: a nested dropdown
                  // inside an already-expanded panel is needless indirection.
                  <div className="grid gap-1" key={item.label}>
                    <p className="px-4 pb-1 pt-3 text-eyebrow uppercase text-ash">
                      {item.label}
                    </p>
                    {item.children.map((child) => (
                      <a
                        key={child.href}
                        href={child.href}
                        onClick={() => setOpen(false)}
                        className="flex items-center justify-between rounded-2xl px-4 py-3 text-base font-semibold hover:bg-black/[0.04]"
                      >
                        {child.label}
                        <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                      </a>
                    ))}
                  </div>
                )
                : (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-between rounded-2xl px-4 py-3 text-base font-semibold hover:bg-black/[0.04]"
                  >
                    {item.label}
                    <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                  </a>
                )
            )}
            <Button asChild className="mt-3 w-full"><a href={ctaHref} onClick={() => setOpen(false)}>{ctaLabel}</a></Button>
          </nav>
        </div>
      ) : null}
    </div>
  );
}
