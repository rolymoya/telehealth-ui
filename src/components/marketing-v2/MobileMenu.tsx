"use client";

import { Menu, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/marketing-v2/ui/Button";

const defaultLinks = [
  ["Weight Loss", "/weight-loss"],
  ["About", "/about"],
  ["FAQs", "/#faq"],
] as const;

type MobileMenuProps = {
  links?: ReadonlyArray<readonly [string, string]>;
  ctaHref?: string;
};

export function MobileMenu({ links = defaultLinks, ctaHref = "/get-started" }: MobileMenuProps) {
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
            {links.map(([label, href]) => (
              <a
                key={label}
                href={href}
                onClick={() => setOpen(false)}
                className="flex items-center justify-between rounded-2xl px-4 py-3 text-base font-semibold hover:bg-black/[0.04]"
              >
                {label}
                <span aria-hidden="true">↗</span>
              </a>
            ))}
            <Button asChild className="mt-3 w-full"><a href={ctaHref} onClick={() => setOpen(false)}>Get started</a></Button>
          </nav>
        </div>
      ) : null}
    </div>
  );
}
