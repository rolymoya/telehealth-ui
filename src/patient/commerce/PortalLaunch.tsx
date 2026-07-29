import { ArrowRight, ExternalLink, ShieldCheck } from "lucide-react";
import { CommerceShell } from "@/patient/commerce/CommerceShell";

export function PortalLaunch() {
  return (
    <CommerceShell stage="portal">
      <main className="mx-auto min-h-[610px] max-w-[1040px] px-5 py-12 sm:px-8 sm:py-20">
        <section className="grid overflow-hidden rounded-[30px] bg-white shadow-[0_24px_75px_rgba(18,18,20,0.09)] md:grid-cols-[1fr_0.72fr]">
          <div className="p-8 sm:p-12">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#e2f1eb] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[#285b45]">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Account secured
            </div>
            <h1 className="mt-6 text-[clamp(2.5rem,6vw,4.7rem)] font-bold leading-[0.93] tracking-[-0.06em]">
              Continue to your medical intake.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-7 text-black/58">
              Your clinical questionnaire and ongoing care live in our secure patient portal. Apoth keeps only the account, billing, and portal linkage needed to get you there.
            </p>
            <form action="/api/portal/launch" method="post" className="mt-8">
              <input name="intent" type="hidden" value="launch" />
              <button className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-[#171719] px-7 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#303033] sm:w-auto" type="submit">
                Continue to medical intake <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </form>
            <p className="mt-4 flex items-center gap-2 text-xs text-black/42"><ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Opens the secure patient portal</p>
          </div>
          <aside className="bg-[#f5df75] p-8 sm:p-10">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-black/45">What happens next</p>
            <ol className="mt-7 space-y-6">
              {[
                "Share your health history in the patient portal.",
                "An independent licensed provider reviews your information.",
                "You are charged only if treatment is approved and your plan begins.",
              ].map((copy, index) => (
                <li className="flex gap-4" key={copy}>
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/70 text-xs font-bold">{index + 1}</span>
                  <span className="pt-0.5 text-sm font-semibold leading-6">{copy}</span>
                </li>
              ))}
            </ol>
          </aside>
        </section>
      </main>
    </CommerceShell>
  );
}
