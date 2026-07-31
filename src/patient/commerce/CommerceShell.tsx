import { Fragment, type ReactNode } from "react";
import { LockKeyhole } from "lucide-react";
import { Wordmark } from "@/components/Icons";
import { marketingHref } from "@/patient/config";

type CommerceStage = "checkout" | "verify" | "portal";

const steps = [
  { key: "checkout", label: "Checkout" },
  { key: "verify", label: "Confirm email" },
  { key: "portal", label: "Medical intake" },
] as const;

export function CommerceShell(input: {
  children: ReactNode;
  stage: CommerceStage;
}) {
  const activeIndex = steps.findIndex((step) => step.key === input.stage);
  return (
    <div className="min-h-screen bg-[#f6f6f7] text-[#171719]">
      <header className="border-b border-black/[0.06] bg-white">
        <div className="mx-auto flex h-[68px] max-w-[1180px] items-center justify-between px-5 sm:h-[76px] sm:px-8">
          <a href={marketingHref("/")} aria-label="Apoth home">
            <Wordmark />
          </a>
          <span className="inline-flex items-center gap-2 text-xs font-semibold text-black/55">
            <LockKeyhole className="h-4 w-4" aria-hidden="true" /> Secure checkout
          </span>
        </div>
      </header>

      <div className="border-b border-black/[0.05] bg-[#fbfbfc]">
        <ol className="mx-auto flex max-w-[720px] items-center px-5 py-4" aria-label="Signup progress">
          {steps.map((step, index) => (
            <Fragment key={step.key}>
              <li
                className={`flex shrink-0 items-center gap-2 text-[10px] font-bold uppercase tracking-[0.09em] sm:text-xs ${
                  index <= activeIndex ? "text-[#171719]" : "text-black/35"
                }`}
              >
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] ${
                    index < activeIndex
                      ? "bg-[#171719] text-white"
                      : index === activeIndex
                        ? "bg-[#f5df75] text-[#171719] ring-1 ring-black/10"
                        : "bg-[#e8e8eb] text-black/45"
                  }`}
                >
                  {index + 1}
                </span>
                <span className="hidden sm:inline">{step.label}</span>
              </li>
              {index < steps.length - 1 ? (
                <li className="mx-3 h-px flex-1 bg-black/10 sm:mx-4" aria-hidden="true" />
              ) : null}
            </Fragment>
          ))}
        </ol>
      </div>

      {input.children}

      <footer className="border-t border-black/[0.06] bg-white px-5 py-8 text-xs text-black/50 sm:px-8">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <p className="max-w-xl leading-5">
            Apoth Health LLC is a technology platform, not a medical provider.
            Treatment requires an independent clinical evaluation and is not guaranteed.
          </p>
          <nav className="flex gap-5" aria-label="Checkout legal">
            <a className="underline underline-offset-4 hover:text-black" href={marketingHref("/privacy")}>Privacy</a>
            <a className="underline underline-offset-4 hover:text-black" href={marketingHref("/terms")}>Terms</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
