import { Fragment, type ReactNode } from "react";
import { LockKeyhole } from "lucide-react";
import { Wordmark } from "@/components/Icons";
import { marketingHref } from "@/patient/config";

type CommerceStage = "checkout" | "verify" | "portal";

const steps = [
  { key: "program", label: "Program" },
  { key: "account", label: "Account" },
  { key: "portal", label: "Clinical intake" },
  { key: "payment", label: "Payment method" },
  { key: "offer", label: "Offer" },
] as const;

export function CommerceShell(input: {
  children: ReactNode;
  stage: CommerceStage;
}) {
  const activeIndex = input.stage === "portal" ? 2 : input.stage === "verify" ? 1 : 0;
  return (
    <div className="min-h-screen bg-[#f9f9fa] text-[#171719]">
      <header className="border-b border-black/[0.07] bg-white">
        <div className="mx-auto flex h-[68px] max-w-[1180px] items-center justify-between px-5 sm:h-[76px] sm:px-8">
          <a href={marketingHref("/")} aria-label="Apoth home">
            <Wordmark />
          </a>
          <span className="inline-flex items-center gap-2 text-xs font-medium text-black/55">
            <LockKeyhole className="h-4 w-4" aria-hidden="true" /> Secure patient flow
          </span>
        </div>
      </header>

      <div className="border-b border-black/[0.06] bg-[#f9f9fa]">
        <ol className="mx-auto flex max-w-[760px] items-center px-5 py-4" aria-label="Enrollment progress">
          {steps.map((step, index) => (
            <Fragment key={step.key}>
              <li
                className={`flex shrink-0 items-center gap-2 text-[10px] font-semibold sm:text-xs ${
                  index <= activeIndex ? "text-[#171719]" : "text-black/55"
                }`}
              >
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] ${
                    index < activeIndex
                      ? "bg-[#171719] text-white"
                      : index === activeIndex
                        ? "bg-[#171719] text-white"
                        : "border border-black/15 bg-white text-black/60"
                  }`}
                >
                  {index + 1}
                </span>
                <span className={index === activeIndex ? "inline" : "hidden sm:inline"}>
                  {step.label}
                </span>
              </li>
              {index < steps.length - 1 ? (
                <li className="mx-3 h-px flex-1 bg-black/10 sm:mx-4" aria-hidden="true" />
              ) : null}
            </Fragment>
          ))}
        </ol>
      </div>

      {input.children}

      <footer className="border-t border-black/[0.07] bg-white px-5 py-8 text-xs text-black/65 sm:px-8">
        <div className="mx-auto flex max-w-[760px] flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
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
