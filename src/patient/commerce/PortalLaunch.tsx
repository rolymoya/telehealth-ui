"use client";

import { useState } from "react";
import { ArrowRight, ExternalLink, LoaderCircle, LockKeyhole, ShieldCheck, TriangleAlert } from "lucide-react";
import { CommerceShell } from "@/patient/commerce/CommerceShell";

export type PortalLaunchError =
  | "authentication_required"
  | "portal_busy"
  | "portal_not_authorized"
  | "portal_unavailable";

const nextSteps = [
  "Share your health history in the independent provider’s secure portal.",
  "A licensed provider reviews your information and determines what is appropriate.",
  "If approved, review the exact treatment and price before any recurring charge begins.",
];

const errorCopy: Record<PortalLaunchError, string> = {
  authentication_required: "Your secure session may have expired. Sign in again, then retry the handoff.",
  portal_busy: "Your portal connection is still being prepared. Wait a moment, then try again.",
  portal_not_authorized: "A required account step is incomplete. Return to your account to review what is needed.",
  portal_unavailable: "The clinical portal is temporarily unavailable. Your account and payment status have not changed.",
};

export function PortalLaunch({ error }: { error?: PortalLaunchError }) {
  const [submitting, setSubmitting] = useState(false);

  return (
    <CommerceShell stage="portal">
      <main className="mx-auto min-h-[560px] max-w-[760px] px-5 py-8 sm:px-8 sm:py-10">
        <section aria-labelledby="portal-title">
          <div className="flex items-center justify-between gap-4 border-b border-black/10 pb-4">
            <span className="inline-flex items-center gap-2 text-xs font-semibold text-black/60">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Account secured
            </span>
            <span className="text-xs text-black/65">Independent clinical care</span>
          </div>

          <div className="py-7 sm:py-9">
            <h1
              className="max-w-[680px] text-[clamp(2.55rem,6vw,3.9rem)] font-[460] leading-[0.98] tracking-[-0.035em] text-balance"
              id="portal-title"
            >
              Continue to your medical intake
            </h1>
            <p className="mt-4 max-w-[650px] text-[1.02rem] leading-7 text-black/65">
              Your clinical questionnaire and ongoing care live in the independent provider’s secure patient portal. Apoth keeps only the account, billing status, consent evidence, and secure linkage needed to get you there.
            </p>

            <div className="mt-6 border-y border-black/10 py-4">
              <p className="flex items-start gap-3 text-sm leading-6 text-black/65">
                <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 stroke-[1.6] text-black" aria-hidden="true" />
                Payment-method setup after intake is $0 due. No subscription starts until clinical approval and your separate acceptance of the exact recurring treatment price.
              </p>
            </div>

            {error ? (
              <div className="mt-6 border border-[#d7b9a8] bg-[#f5ece5] px-4 py-3" role="alert">
                <div className="flex items-start gap-3">
                  <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-[#7c3f20]" aria-hidden="true" />
                  <div>
                    <h2 className="text-sm font-semibold">We couldn’t open the clinical portal</h2>
                    <p className="mt-1 text-sm leading-5 text-black/70">{errorCopy[error]}</p>
                    <a className="mt-2 inline-block text-sm font-semibold underline underline-offset-4" href="/account">
                      Return to account
                    </a>
                  </div>
                </div>
              </div>
            ) : null}

            <form
              action="/api/portal/launch"
              method="post"
              className="mt-6"
              onSubmit={() => setSubmitting(true)}
            >
              <input name="intent" type="hidden" value="launch" />
              <button
                className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-[#171719] px-7 text-sm font-semibold text-white transition hover:-translate-y-px hover:bg-[#343437]"
                disabled={submitting}
                type="submit"
              >
                {submitting ? (
                  <>Opening secure portal <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /></>
                ) : (
                  <>{error ? "Try secure portal again" : "Continue to medical intake"} <ArrowRight className="h-4 w-4" aria-hidden="true" /></>
                )}
              </button>
            </form>
            <p className="mt-3 flex items-center justify-center gap-2 text-xs text-black/65" aria-live="polite">
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Opens the secure patient portal
            </p>
          </div>

          <aside className="border-t border-black/10 py-7" aria-labelledby="next-heading">
            <h2 className="text-xl font-semibold tracking-[-0.02em]" id="next-heading">What happens next</h2>
            <ol className="mt-5 divide-y divide-black/10 border-y border-black/10">
              {nextSteps.map((copy, index) => (
                <li className="grid grid-cols-[28px_1fr] gap-4 py-5" key={copy}>
                  <span className="grid h-7 w-7 place-items-center rounded-full border border-black/20 text-xs font-semibold">{index + 1}</span>
                  <span className="pt-0.5 text-sm leading-6 text-black/65">{copy}</span>
                </li>
              ))}
            </ol>
          </aside>
        </section>
      </main>
    </CommerceShell>
  );
}
